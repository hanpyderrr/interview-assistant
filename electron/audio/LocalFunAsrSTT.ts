import { EventEmitter } from 'events';
import {
    CaptureAudioTimeline,
    type CaptureChannel,
    type CapturedPcmChunk,
} from './CaptureAudioTimeline';

export const LOCAL_FUNASR_ORIGIN = 'http://127.0.0.1:8765';
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_UTTERANCE_SECONDS = 600;

export interface LocalFunAsrResponse {
    text: string;
    inference_seconds?: number;
    total_seconds?: number;
}

export interface LocalFunAsrRequest {
    pcm: Buffer;
    sampleRate: number;
}

export type LocalFunAsrRequestTransport = (
    request: LocalFunAsrRequest,
) => Promise<LocalFunAsrResponse>;

export interface LocalFunAsrSTTOptions {
    channel: CaptureChannel;
    timeline: CaptureAudioTimeline;
    requestTranscription?: LocalFunAsrRequestTransport;
    monotonicNow?: () => number;
}

interface PendingUtterance {
    bytes: Buffer[];
    byteLength: number;
    sampleRate: number;
    firstChunk: CapturedPcmChunk;
    lastChunk: CapturedPcmChunk;
    generation: number;
}

function assertValidPcmChunk(bytes: Buffer): void {
    if (!Buffer.isBuffer(bytes)) {
        throw new TypeError('PCM bytes must be a Buffer');
    }
    if (bytes.length === 0) {
        throw new RangeError('PCM buffer must not be empty');
    }
    if (bytes.length % 2 !== 0) {
        throw new RangeError('PCM S16LE buffer must contain an even number of bytes');
    }
}

function isAllZeroPcm(bytes: Buffer): boolean {
    for (const byte of bytes) {
        if (byte !== 0) return false;
    }
    return true;
}

function errorFromResponse(status: number, body: unknown): Error {
    const detail = body && typeof body === 'object' && 'detail' in body
        ? String((body as { detail?: unknown }).detail ?? '')
        : '';
    return new Error(`Local FunASR request failed (${status})${detail ? `: ${detail}` : ''}`);
}

export async function requestLocalFunAsr(
    request: LocalFunAsrRequest,
): Promise<LocalFunAsrResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const query = new URLSearchParams({
            sample_rate: String(request.sampleRate),
            channels: '1',
            sample_width: '2',
        });
        const response = await fetch(`${LOCAL_FUNASR_ORIGIN}/transcribe?${query}`, {
            method: 'POST',
            headers: { 'content-type': 'application/octet-stream' },
            body: new Uint8Array(request.pcm),
            signal: controller.signal,
        });
        let body: unknown;
        try {
            body = await response.json();
        } catch {
            body = undefined;
        }
        if (!response.ok) throw errorFromResponse(response.status, body);
        if (!body || typeof body !== 'object' || typeof (body as { text?: unknown }).text !== 'string') {
            throw new Error('Local FunASR returned an invalid response');
        }
        return body as LocalFunAsrResponse;
    } finally {
        clearTimeout(timer);
    }
}

export class LocalFunAsrSTT extends EventEmitter {
    public readonly drainTimeoutMs = REQUEST_TIMEOUT_MS + 5_000;
    private readonly channel: CaptureChannel;
    private readonly timeline: CaptureAudioTimeline;
    private readonly requestTranscription: LocalFunAsrRequestTransport;
    private readonly monotonicNow: () => number;
    private sampleRate = 16_000;
    private generation: number | undefined;
    private utterance: PendingUtterance | undefined;
    private requestQueue: Promise<void> = Promise.resolve();
    private segmentId = 0;
    private requestEpoch = 0;
    private stopped = false;
    private writeClosed = true;

    constructor(options: LocalFunAsrSTTOptions) {
        super();
        this.channel = options.channel;
        this.timeline = options.timeline;
        this.requestTranscription = options.requestTranscription ?? requestLocalFunAsr;
        this.monotonicNow = options.monotonicNow ?? (() => performance.now());
    }

    public setSampleRate(rate: number): void {
        if (!Number.isSafeInteger(rate) || rate <= 0) {
            throw new RangeError('Sample rate must be a positive safe integer');
        }
        if (this.utterance && rate !== this.sampleRate) {
            this.emit('error', new Error('Local FunASR sample rate changed during an utterance; buffered audio was reset'));
            this.utterance = undefined;
        }
        this.sampleRate = rate;
    }

    public setAudioChannelCount(count: number): void {
        if (count !== 1) throw new RangeError('Local FunASR supports mono PCM only');
    }

    public setRecognitionLanguage(_language: string): void {
        // The local service currently owns its language/model configuration.
    }

    public beginCaptureSession(generation: number, _originMonotonicMs: number): void {
        if (!Number.isSafeInteger(generation) || generation < 0) {
            throw new RangeError('Capture generation must be a non-negative safe integer');
        }
        if (this.generation !== undefined && generation < this.generation) {
            throw new Error('Capture generation must not move backwards');
        }
        if (this.generation === generation && !this.stopped) return;
        this.requestEpoch += 1;
        this.requestQueue = Promise.resolve();
        this.generation = generation;
        this.utterance = undefined;
        this.segmentId = 0;
        this.stopped = false;
        this.writeClosed = false;
    }

    public start(): void {
        // Capture sessions are opened by beginCaptureSession().
    }

    public write(bytes: Buffer): void {
        if (this.stopped) throw new Error('Local FunASR provider has been stopped');
        if (this.writeClosed || this.generation === undefined) {
            throw new Error('Local FunASR write gate is closed until a capture session begins');
        }
        assertValidPcmChunk(bytes);
        // Native silence suppression emits periodic zero-filled keepalives.
        // They must not become the first chunk of the next utterance, otherwise
        // a much later real question appears adjacent to the previous one.
        if (!this.utterance && isAllZeroPcm(bytes)) return;
        const chunk = this.timeline.stamp(
            this.channel,
            bytes,
            this.sampleRate,
            this.monotonicNow(),
        );
        const maxBytes = this.sampleRate * 2 * MAX_UTTERANCE_SECONDS;
        const nextLength = (this.utterance?.byteLength ?? 0) + bytes.length;
        if (nextLength > maxBytes) {
            this.utterance = undefined;
            this.emit('error', new Error('Local FunASR utterance exceeded the 10-minute safety limit'));
            return;
        }
        if (!this.utterance) {
            this.utterance = {
                bytes: [],
                byteLength: 0,
                sampleRate: this.sampleRate,
                firstChunk: chunk,
                lastChunk: chunk,
                generation: this.generation,
            };
        }
        this.utterance.bytes.push(Buffer.from(bytes));
        this.utterance.byteLength = nextLength;
        this.utterance.lastChunk = chunk;
    }

    public notifySpeechEnded(): void {
        this.flushUtterance();
    }

    public flush(): Promise<void> {
        this.flushUtterance();
        return this.requestQueue;
    }

    public finalize(): Promise<void> {
        this.writeClosed = true;
        this.flushUtterance();
        return this.requestQueue;
    }

    public stop(): void {
        if (this.stopped) return;
        this.requestEpoch += 1;
        this.stopped = true;
        this.writeClosed = true;
        this.generation = undefined;
        this.utterance = undefined;
    }

    private flushUtterance(): void {
        const utterance = this.utterance;
        this.utterance = undefined;
        if (!utterance || utterance.byteLength === 0) return;
        const segmentId = ++this.segmentId;
        const requestEpoch = this.requestEpoch;
        const pcm = Buffer.concat(utterance.bytes, utterance.byteLength);
        const isCurrentRequest = () => (
            !this.stopped
            && this.requestEpoch === requestEpoch
            && this.generation === utterance.generation
        );
        const run = async () => {
            if (!isCurrentRequest()) return;
            try {
                const response = await this.requestTranscription({
                    pcm,
                    sampleRate: utterance.sampleRate,
                });
                const text = response.text.trim();
                if (!text || !isCurrentRequest()) return;
                this.emit('transcript', {
                    text,
                    isFinal: true,
                    confidence: 0.9,
                    segmentId,
                    audioStartMs: utterance.firstChunk.captureStartMs,
                    audioEndMs: utterance.lastChunk.captureEndMs,
                    sttSessionGeneration: utterance.generation,
                });
            } catch (error) {
                if (!isCurrentRequest()) return;
                this.emit('error', error instanceof Error ? error : new Error(String(error)));
            }
        };
        this.requestQueue = this.requestQueue.then(run, run);
    }
}
