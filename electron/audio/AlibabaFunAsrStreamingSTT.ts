import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import WebSocket from 'ws';

import { RECOGNITION_LANGUAGES } from '../config/languages';
import type { AlibabaFunAsrModel, AlibabaFunAsrRegion } from './AlibabaFunAsrProtocol';
import {
    buildAlibabaEndpoint,
    buildFinishTask,
    buildRunTask,
    parseAlibabaServerEvent,
} from './AlibabaFunAsrProtocol';
import type { CaptureChannel, CapturedPcmChunk } from './CaptureAudioTimeline';
import {
    CaptureAudioTimeline,
} from './CaptureAudioTimeline';

const MAX_QUEUED_AUDIO_MS = 5_000;
const WATCHDOG_MS = 75_000;
const FINALIZE_DEADLINE_MS = 10_000;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const;
const USER_AGENT = 'Natively AlibabaFunAsrStreamingSTT/1';

interface SocketLike {
    readyState: number;
    on(event: string, listener: (...args: any[]) => void): this;
    send(data: string | Buffer): void;
    close(code?: number, reason?: string): void;
}

interface TimerHandle {}

interface TimerApi {
    setTimeout(callback: () => void, delayMs: number): TimerHandle;
    clearTimeout(handle: TimerHandle): void;
}

export interface AlibabaFunAsrStreamingSTTOptions {
    apiKey: string;
    region: AlibabaFunAsrRegion;
    model: AlibabaFunAsrModel;
    workspaceId: string;
    vocabularyId?: string;
    channel: CaptureChannel;
    timeline: CaptureAudioTimeline;
    wsFactory?: (url: string, options: { headers: Record<string, string> }) => SocketLike;
    uuid?: () => string;
    monotonicNow?: () => number;
    timers?: TimerApi;
}

interface TaskState {
    taskId: string;
    connectionGeneration: number;
    captureGeneration: number;
    started: boolean;
    finishSent: boolean;
    baseCaptureStartMs?: number;
    confirmedSentDurationMs: number;
}

interface FinalizeState {
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: Error) => void;
    timer?: TimerHandle;
    settled: boolean;
}

export interface AlibabaStreamingWarning {
    kind: 'alibaba-streaming-warning';
    code: 'audio-queue-overflow' | 'unmapped-server-time' | 'protocol-error' | 'reconnect-exhausted';
    generation: number;
    taskId?: string;
    droppedDurationMs?: number;
}

type CodedError = Error & { code: string; taskId?: string };

export class AlibabaFunAsrStreamingSTT extends EventEmitter {
    private readonly apiKey: string;
    private readonly region: AlibabaFunAsrRegion;
    private readonly model: AlibabaFunAsrModel;
    private readonly workspaceId: string;
    private readonly vocabularyId?: string;
    private readonly channel: CaptureChannel;
    private readonly timeline: CaptureAudioTimeline;
    private readonly wsFactory: AlibabaFunAsrStreamingSTTOptions['wsFactory'];
    private readonly uuid: () => string;
    private readonly monotonicNow: () => number;
    private readonly timers: TimerApi;

    private sampleRate = 16_000;
    private languageHint?: string;
    private captureGeneration?: number;
    private connectionGeneration = 0;
    private socket: SocketLike | null = null;
    private task: TaskState | null = null;
    private queue: CapturedPcmChunk[] = [];
    private queuedDurationMs = 0;
    private reconnectAttempts = 0;
    private reconnectTimer?: TimerHandle;
    private watchdogTimer?: TimerHandle;
    private finalizeState?: FinalizeState;
    private segmentId = 0;
    private stopped = false;
    private authFatal = false;

    constructor(options: AlibabaFunAsrStreamingSTTOptions) {
        super();
        if (typeof options.apiKey !== 'string' || options.apiKey.length === 0) {
            throw new TypeError('Alibaba API key is required');
        }
        buildAlibabaEndpoint(options.workspaceId, options.region);
        buildRunTask('123e4567-e89b-42d3-a456-426614174000', {
            sampleRate: this.sampleRate,
            model: options.model,
            vocabularyId: options.vocabularyId,
        });
        this.apiKey = options.apiKey;
        this.region = options.region;
        this.model = options.model;
        this.workspaceId = options.workspaceId;
        this.vocabularyId = options.vocabularyId;
        this.channel = options.channel;
        this.timeline = options.timeline;
        this.wsFactory = options.wsFactory;
        this.uuid = options.uuid ?? randomUUID;
        this.monotonicNow = options.monotonicNow ?? (() => performance.now());
        this.timers = options.timers ?? {
            setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
            clearTimeout: handle => clearTimeout(handle as NodeJS.Timeout),
        };
    }

    public setSampleRate(rate: number): void {
        if (!Number.isSafeInteger(rate) || rate <= 0) {
            throw new RangeError('Sample rate must be a positive safe integer');
        }
        if (this.task !== null) {
            throw new Error('Cannot change sample rate during an active task');
        }
        this.sampleRate = rate;
    }

    public setAudioChannelCount(count: number): void {
        if (count !== 1) throw new RangeError('Alibaba Fun-ASR supports mono channel audio only');
    }

    public setRecognitionLanguage(key: string): void {
        if (this.task !== null) {
            throw new Error('Cannot change recognition language during an active task');
        }
        const language = RECOGNITION_LANGUAGES[key];
        if (!language) throw new TypeError('Unsupported recognition language');
        this.languageHint = key === 'auto' ? undefined : language.iso639;
    }

    public beginCaptureSession(generation: number, originMonotonicMs: number): void {
        if (!Number.isSafeInteger(generation) || generation < 0) {
            throw new RangeError('Capture generation must be a non-negative safe integer');
        }
        if (!Number.isFinite(originMonotonicMs) || originMonotonicMs < 0) {
            throw new RangeError('Capture origin must be finite and non-negative');
        }
        if (this.captureGeneration !== undefined && generation < this.captureGeneration) {
            throw new Error('Capture generation must not move backwards');
        }
        if (this.captureGeneration === generation && !this.stopped) return;

        this.settleFinalize(this.codedError('alibaba-session-replaced', 'Alibaba capture session was replaced'));
        this.finalizeState = undefined;
        this.invalidateConnection();
        this.captureGeneration = generation;
        this.segmentId = 0;
        this.reconnectAttempts = 0;
        this.authFatal = false;
        this.stopped = false;
    }

    public write(bytes: Buffer): void {
        if (this.stopped) throw new Error('Alibaba streaming STT has been stopped');
        if (this.captureGeneration === undefined) throw new Error('Capture session has not begun');
        const chunk = this.timeline.stamp(this.channel, bytes, this.sampleRate, this.monotonicNow());
        this.enqueue(chunk);

        const task = this.task;
        if (task?.started && this.isSocketOpen()) {
            this.flushQueue(task);
            return;
        }
        if (!this.socket && !this.reconnectTimer && !this.authFatal) this.connect();
    }

    public finalize(): Promise<void> {
        if (this.finalizeState) return this.finalizeState.promise;
        if (!this.task) return Promise.resolve();

        let resolve!: () => void;
        let reject!: (error: Error) => void;
        const promise = new Promise<void>((resolvePromise, rejectPromise) => {
            resolve = resolvePromise;
            reject = rejectPromise;
        });
        const state: FinalizeState = { promise, resolve, reject, settled: false };
        this.finalizeState = state;
        state.timer = this.timers.setTimeout(() => this.settleFinalize(), FINALIZE_DEADLINE_MS);
        this.sendFinishIfReady(this.task);
        return promise;
    }

    public stop(): void {
        if (this.stopped) return;
        this.stopped = true;
        this.captureGeneration = undefined;
        this.settleFinalize(this.codedError('alibaba-stopped', 'Alibaba streaming STT stopped'));
        this.invalidateConnection();
    }

    private connect(): void {
        const captureGeneration = this.captureGeneration;
        if (captureGeneration === undefined || this.stopped || this.authFatal || this.socket) return;
        const connectionGeneration = ++this.connectionGeneration;
        const taskId = this.uuid();
        const task: TaskState = {
            taskId,
            connectionGeneration,
            captureGeneration,
            started: false,
            finishSent: false,
            confirmedSentDurationMs: 0,
        };
        this.task = task;
        const endpoint = buildAlibabaEndpoint(this.workspaceId, this.region);
        const options = {
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'user-agent': USER_AGENT,
            },
        };
        const socket = this.wsFactory
            ? this.wsFactory(endpoint, options)
            : new WebSocket(endpoint, options) as unknown as SocketLike;
        this.socket = socket;

        socket.on('open', () => {
            if (!this.matches(socket, task)) return;
            socket.send(JSON.stringify(buildRunTask(taskId, {
                sampleRate: this.sampleRate,
                model: this.model,
                languageHint: this.languageHint,
                vocabularyId: this.vocabularyId,
            })));
        });
        socket.on('message', raw => this.onMessage(socket, task, raw));
        socket.on('close', (code: number) => this.onClose(socket, task, code));
        socket.on('error', () => {
            // The close event owns retry and finalize semantics. Error payloads are never exposed.
        });
        socket.on('unexpected-response', (_request, response: { statusCode?: number }) => {
            if (!this.matches(socket, task)) return;
            if (response?.statusCode === 401 || response?.statusCode === 403) {
                this.authFatal = true;
                this.clearReconnectTimer();
                this.clearWatchdog();
                this.socket = null;
                this.task = null;
                try { socket.close(); } catch { /* best effort */ }
                const error = this.codedError('alibaba-auth-failed', `Alibaba authentication failed (${response.statusCode})`);
                this.settleFinalize(error);
                this.emit('error', error);
            }
        });
    }

    private onMessage(socket: SocketLike, task: TaskState, raw: unknown): void {
        if (!this.matches(socket, task)) return;
        const value = Buffer.isBuffer(raw) ? raw.toString('utf8') : raw;
        const parsed = parseAlibabaServerEvent(value);
        if (!parsed.ok) {
            this.emitWarning({ code: 'protocol-error', taskId: task.taskId });
            return;
        }
        if (parsed.event.taskId !== task.taskId) return;
        this.armWatchdog(socket, task);

        switch (parsed.event.type) {
            case 'task-started':
                if (!task.started) {
                    task.started = true;
                    this.flushQueue(task);
                    this.sendFinishIfReady(task);
                }
                return;
            case 'result-generated':
                this.emitSentence(task, parsed.event.sentence);
                return;
            case 'task-finished':
                this.settleFinalize();
                return;
            case 'task-failed':
                this.settleFinalize(this.codedError(
                    'alibaba-task-failed',
                    `Alibaba task failed (${parsed.event.errorCode})`,
                    task.taskId,
                ));
                return;
        }
    }

    private emitSentence(task: TaskState, sentence: {
        beginTime: number;
        endTime: number | null;
        text: string;
        heartbeat: boolean;
        sentenceEnd: boolean;
    }): void {
        const text = sentence.text.trim();
        if (sentence.heartbeat || text.length === 0) return;
        const transcript: Record<string, unknown> = {
            text,
            isFinal: sentence.sentenceEnd,
            confidence: 1,
            segmentId: ++this.segmentId,
        };
        const base = task.baseCaptureStartMs;
        const end = sentence.endTime;
        if (
            base !== undefined
            && end !== null
            && sentence.beginTime <= end
            && end <= task.confirmedSentDurationMs
        ) {
            transcript.audioStartMs = base + sentence.beginTime;
            transcript.audioEndMs = base + end;
        } else if (end !== null) {
            this.emitWarning({ code: 'unmapped-server-time', taskId: task.taskId });
        }
        this.emit('transcript', transcript);
    }

    private enqueue(chunk: CapturedPcmChunk): void {
        const durationMs = chunk.captureEndMs - chunk.captureStartMs;
        this.queue.push(chunk);
        this.queuedDurationMs += durationMs;
        let droppedDurationMs = 0;
        while (this.queuedDurationMs > MAX_QUEUED_AUDIO_MS && this.queue.length > 0) {
            const dropped = this.queue.shift()!;
            const droppedMs = dropped.captureEndMs - dropped.captureStartMs;
            this.queuedDurationMs -= droppedMs;
            droppedDurationMs += droppedMs;
        }
        if (droppedDurationMs > 0) {
            this.emitWarning({ code: 'audio-queue-overflow', droppedDurationMs });
        }
    }

    private flushQueue(task: TaskState): void {
        if (!this.taskMatches(task) || !task.started || !this.isSocketOpen()) return;
        while (this.queue.length > 0 && this.taskMatches(task) && this.isSocketOpen()) {
            const chunk = this.queue.shift()!;
            const durationMs = chunk.captureEndMs - chunk.captureStartMs;
            this.queuedDurationMs -= durationMs;
            try {
                this.socket!.send(chunk.bytes);
            } catch {
                this.queue.unshift(chunk);
                this.queuedDurationMs += durationMs;
                return;
            }
            if (task.baseCaptureStartMs === undefined) task.baseCaptureStartMs = chunk.captureStartMs;
            task.confirmedSentDurationMs += durationMs;
        }
    }

    private sendFinishIfReady(task: TaskState): void {
        if (!this.finalizeState || task.finishSent || !task.started || !this.isSocketOpen()) return;
        if (!this.taskMatches(task)) return;
        this.socket!.send(JSON.stringify(buildFinishTask(task.taskId)));
        task.finishSent = true;
    }

    private onClose(socket: SocketLike, task: TaskState, code: number): void {
        if (!this.matches(socket, task)) return;
        this.clearWatchdog();
        this.socket = null;
        this.task = null;
        this.queue = [];
        this.queuedDurationMs = 0;
        if (this.finalizeState) {
            this.settleFinalize(this.codedError('alibaba-socket-closed', `Alibaba socket closed (${code})`, task.taskId));
        }
        if (!this.stopped && !this.authFatal && code !== 1000) this.scheduleReconnect();
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer || this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                this.emitWarning({ code: 'reconnect-exhausted' });
            }
            return;
        }
        const index = Math.min(this.reconnectAttempts, RECONNECT_DELAYS_MS.length - 1);
        const delay = RECONNECT_DELAYS_MS[index];
        this.reconnectAttempts++;
        this.reconnectTimer = this.timers.setTimeout(() => {
            this.reconnectTimer = undefined;
            if (!this.stopped && !this.authFatal && this.queue.length > 0) this.connect();
        }, delay);
    }

    private armWatchdog(socket: SocketLike, task: TaskState): void {
        this.clearWatchdog();
        this.watchdogTimer = this.timers.setTimeout(() => {
            this.watchdogTimer = undefined;
            if (!this.matches(socket, task)) return;
            this.socket = null;
            this.task = null;
            this.queue = [];
            this.queuedDurationMs = 0;
            try { socket.close(); } catch { /* best effort */ }
            if (this.finalizeState) {
                this.settleFinalize(this.codedError('alibaba-socket-closed', 'Alibaba socket liveness deadline exceeded', task.taskId));
            }
            this.scheduleReconnect();
        }, WATCHDOG_MS);
    }

    private emitWarning(fields: Omit<AlibabaStreamingWarning, 'kind' | 'generation'>): void {
        if (this.captureGeneration === undefined) return;
        this.emit('warning', {
            kind: 'alibaba-streaming-warning',
            ...fields,
            generation: this.captureGeneration,
        } satisfies AlibabaStreamingWarning);
    }

    private settleFinalize(error?: Error): void {
        const state = this.finalizeState;
        if (!state || state.settled) return;
        state.settled = true;
        if (state.timer !== undefined) this.timers.clearTimeout(state.timer);
        if (error) state.reject(error);
        else state.resolve();
    }

    private invalidateConnection(): void {
        this.connectionGeneration++;
        this.clearReconnectTimer();
        this.clearWatchdog();
        const socket = this.socket;
        this.socket = null;
        this.task = null;
        this.queue = [];
        this.queuedDurationMs = 0;
        if (socket) {
            try { socket.close(); } catch { /* best effort */ }
        }
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer !== undefined) {
            this.timers.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
    }

    private clearWatchdog(): void {
        if (this.watchdogTimer !== undefined) {
            this.timers.clearTimeout(this.watchdogTimer);
            this.watchdogTimer = undefined;
        }
    }

    private matches(socket: SocketLike, task: TaskState): boolean {
        return this.socket === socket && this.taskMatches(task);
    }

    private taskMatches(task: TaskState): boolean {
        return this.task === task
            && this.connectionGeneration === task.connectionGeneration
            && this.captureGeneration === task.captureGeneration;
    }

    private isSocketOpen(): boolean {
        return this.socket?.readyState === 1;
    }

    private codedError(code: string, message: string, taskId?: string): CodedError {
        const error = new Error(message) as CodedError;
        error.code = code;
        if (taskId !== undefined) error.taskId = taskId;
        return error;
    }
}
