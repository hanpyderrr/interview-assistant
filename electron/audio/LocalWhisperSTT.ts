/**
 * LocalWhisperSTT — local Whisper / Distil-Whisper / Moonshine STT provider.
 *
 * Dual-channel architecture: Natively captures Mic and System Audio as two
 * completely separate native streams. createSTTProvider() instantiates this
 * class TWICE — once per channel. No diarization model is needed; speaker
 * attribution is free from the hardware.
 *
 * STREAMING DESIGN (closes the latency gap with cloud STT):
 *
 *   Cloud STT providers (Deepgram/Soniox/ElevenLabs) emit *interim*
 *   transcripts every 100–300ms while the user is still speaking. Whisper
 *   wasn't designed for streaming — we approximate it with a per-model
 *   profile (see resolveStreamingProfile):
 *
 *   Whisper / Distil-Whisper path (slow, batch-architected models):
 *     - Tick every 1000ms while a segment is open (after 500ms of audio)
 *     - Apply LocalAgreement-2: only commit text where two overlapping
 *       inferences agree (longest common prefix). Stabilizes flicker.
 *     - First interim emit ~1.5–2.5s after speech starts.
 *
 *   Moonshine path (streaming-native, deterministic, ~100ms inference):
 *     - Tick every 750ms after just 400ms of audio
 *     - Skip LA-2 — the model's output is already stable; emit each
 *       cleaned partial directly.
 *     - First interim emit ~400–600ms after speech starts.
 *
 *   When VAD closes the segment (or hits MAX_SEGMENT_MS for a soft commit):
 *     - Run a final pass on the full segment
 *     - Emit { isFinal: true, confidence: 0.9 }
 *     - Reset session state for the next segment
 */

import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import { resampleToF32 } from './whisper/audioResampler';
import { VadProcessor } from './whisper/vadProcessor';
import { MeetilyVadProcessor, MEETILY_VAD_DEFAULTS } from './whisper/meetilyVadProcessor';
import { filterHallucination } from './whisper/hallucinationFilter';
import { configureTransformersCache } from './whisper/modelManager';
import { clearLoadSentinel, modelPreloader, writeLoadSentinel } from './whisper/modelPreloader';
import { buildWorkerInitMessage } from './whisper/inferenceConfig';
import { resolveWhisperWorkerPath } from './whisper/workerPathResolver';
import type { LocalWhisperSegmenterMode, SpeechSegment, WorkerOutMessage } from './whisper/types';
import { acquireOnnxSlot, hasEnoughMemoryForOnnxSession, getMinFreeGBForOnnxSession, getOnnxGateSnapshot } from '../utils/onnxThreadConfig';
import { RECOGNITION_LANGUAGES } from '../config/languages';
import { SettingsManager } from '../services/SettingsManager';
import { CapturePcmTimelineMapper } from './capturePcmTimelineMapper';

type Segmenter = {
    push: (samples: Float32Array) => SpeechSegment[];
    peekOpenSegment: () => { samples: Float32Array; durationMs: number } | null;
    softCommit: () => SpeechSegment | null;
    flush: () => SpeechSegment[];
    reset: () => void;
    isInSpeech: () => boolean;
    currentSegmentId: () => number;
    notifySpeechEnded?: () => SpeechSegment[];
};

type FinalSegmentMetadata = {
    sessionId: number;
    sequenceId: number;
    startMs: number;
    endMs: number;
    hostDispatchMonotonicMs?: number;
    confidence?: number;
};

type PendingFinal = {
    audio: Float32Array;
    metadata: FinalSegmentMetadata;
};

export class LocalWhisperSTT extends EventEmitter {
    private readonly modelId: string;
    private inputSampleRate = 48000;
    private language = 'auto';
    // Optional context-biasing prompt sent out-of-band to the worker via
    // `setPrompt` messages. The worker tokenizes once and reuses the IDs
    // for every transcribe (see whisperWorker.ts updatePromptCache). 224
    // Whisper-decoder tokens cap is enforced worker-side. No-op for Moonshine.
    private contextPrompt = '';
    private contextPromptSentToWorker = '';
    // Char-length cap to prevent enormous strings from being copied through
    // worker IPC. ~8KB is well above 224 Whisper tokens (~3-4 chars/token).
    private static readonly PROMPT_MAX_CHARS = 8000;

    // ── Latency telemetry ──────────────────────────────────────────────
    // Perceived latency tracking. Two metrics:
    //   firstPartial = ms from VAD opening a segment → first agreed/committed
    //                  prefix emit (LocalAgreement-2 needs two streaming ticks
    //                  to converge, so this is NOT "first inference time").
    //   final        = ms from VAD opening a segment → final transcript emit.
    // Boundary detection uses VadProcessor.currentSegmentId() (monotonic
    // counter) instead of boolean edges on isInSpeech() — boolean edges miss
    // open+close-in-one-push and close+open-in-one-push patterns.
    private trackedSegmentId = 0;
    private segmentOpenedAt = 0;
    private firstPartialEmittedForSegment = 0;
    private firstPartialLatencies: number[] = [];
    private finalLatencies: number[] = [];
    private static readonly LATENCY_WINDOW = 100;
    private static readonly LATENCY_LOG_EVERY = 20;
    // Sanity clamp: any latency outside this range is treated as a tracking
    // bug (e.g. clock issue, missed segment id) and discarded so it can't
    // pollute p95/p99.
    private static readonly LATENCY_MAX_MS = 60_000;
    private latencyLogCounter = 0;
    // Optional channel label ('mic' / 'system') — disambiguates log lines
    // when both LocalWhisperSTT instances run the same model.
    private channelLabel = '';
    private worker: Worker | null = null;
    private vad: Segmenter | null = null;
    private segmenterMode: LocalWhisperSegmenterMode = 'baseline';
    private sessionGeneration = 0;
    private sessionAudioMs = 0;
    private captureTimeline: CapturePcmTimelineMapper | null = null;
    private segmentAxisBaseMs = 0;
    private segmentSequence = 0;
    private segmentIdBase = 0;
    private segmenterFallbackLogged = false;
    private isActive = false;
    // Cross-loader ONNX gate slot. Acquired in spawnWorker() before posting
    // init; released in worker error/exit handlers so other ONNX consumers
    // (LocalReranker / LocalEmbeddingProvider / IntentClassifier) can take
    // the slot promptly. Whisper uses priority 'high' so its streaming loop
    // acquires before queued normal-priority consumers.
    private slotRelease: (() => void) | null = null;
    private taskCounter = 0;
    private workerReady = false;
    private isDrainingFinals = false;
    private drainingFinalsInFlight = 0;
    // Pending audio waiting for the worker to become ready. Always finals —
    // streaming partials are never queued (they're best-effort and only fire
    // while a segment is open AND the worker is ready).
    private pendingAudio: PendingFinal[] = [];
    private finalTaskMetadata = new Map<string, FinalSegmentMetadata>();
    // Phase 18 Step 2 diagnostic-only: host-local performance.now() dispatch
    // stamp per final taskId, used to compute a same-host round-trip
    // duration when the worker's result returns. Never mixed with the
    // worker's own (separate-clock) internal timings.
    private finalDispatchedAt = new Map<string, number>();

    // Gap-flush: ensures a segment closes even if Rust SilenceSuppressor
    // stops sending audio before VAD's hangover completes.
    private gapFlushTimer: ReturnType<typeof setTimeout> | null = null;
    private speechEndedFlushTimer: ReturnType<typeof setTimeout> | null = null;
    private static readonly GAP_FLUSH_MS = 400;
    // Each worker owns its termination timer. A single shared timer can be
    // overwritten by a rapid stop/start cycle, leaving an older worker alive
    // while its ONNX slot has already been released.
    private workerTerminateTimers = new Map<Worker, ReturnType<typeof setTimeout>>();

    // Streaming inference loop state.
    // Self-chaining setTimeout (not setInterval) so the delay can adapt at
    // each tick — the worker can be slower than STREAMING_INTERVAL_MS for
    // larger models (whisper-medium ~3-5s, whisper-large ~5-10s); piling up
    // ticks against an in-flight inference just churns the JS event loop.
    private streamingTimer: ReturnType<typeof setTimeout> | null = null;
    // Tuned per model family at construction time (see resolveStreamingProfile).
    private readonly streamingIntervalBaseMs: number;
    private readonly streamingMinAudioMs: number;
    private readonly skipAgreement: boolean;
    private static readonly STREAMING_INTERVAL_MAX_MS = 12000;
    private static readonly MAX_SEGMENT_MS = 14000;       // soft-commit before VAD's 15s hard-flush
    // Backoff: count consecutive ticks where we couldn't dispatch (worker
    // busy or no open segment with enough audio). After 3 in a row, double
    // the next delay; reset to base on a successful dispatch.
    private streamingStallCount = 0;
    private streamingNextDelayMs = 0; // set in constructor from streamingIntervalBaseMs
    // Watchdog: if the worker takes longer than this on an in-flight streaming
    // task we assume it's stuck (hypothesis: GPU lock, deadlock, dead pointer)
    // and force-clear the in-flight state so the loop can recover. Without
    // this, a stuck worker permanently pins streamingTaskInFlight=true and
    // every subsequent tick is a no-op stall (transcription appears to stop
    // after 3-4 questions once the worker gets wedged).
    private streamingWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
    private static readonly STREAMING_WATCHDOG_MS = 30000;

    // LocalAgreement-2 state. We hold the last partial transcript, and when
    // the next partial arrives we emit the longest common prefix as the
    // "stable" interim. The lastEmittedText is what we've already shown.
    private lastPartialText = '';
    private lastEmittedText = '';
    private streamingTaskInFlight = false;
    private streamingTaskId: string | null = null;

    constructor(modelId: string) {
        super();
        this.modelId = modelId;
        configureTransformersCache();

        // Tune the streaming loop for this specific model's characteristics.
        // Moonshine: ~100ms inference, deterministic single-pass output, no
        // 30s padding. We can poll faster, dispatch on shorter audio, and
        // skip LocalAgreement-2's two-pass stability check (which adds an
        // entire tick of latency).
        // Whisper / Distil-Whisper: ~500ms-5s inference, conservative
        // params, LA-2 needed for stability.
        const profile = LocalWhisperSTT.resolveStreamingProfile(modelId);
        this.streamingIntervalBaseMs = profile.intervalMs;
        this.streamingMinAudioMs = profile.minAudioMs;
        this.skipAgreement = profile.skipAgreement;
        this.streamingNextDelayMs = this.streamingIntervalBaseMs;
        console.log(`[LocalWhisperSTT] streaming profile for ${modelId}: interval=${profile.intervalMs}ms minAudio=${profile.minAudioMs}ms skipAgreement=${profile.skipAgreement}`);
    }

    /**
     * Per-model streaming-loop profile. Faster, more aggressive parameters
     * for streaming-class models (Moonshine) — they finish each pass in
     * <200ms and produce stable output, so we can poll often and emit
     * partials directly without LocalAgreement-2's two-pass confirmation.
     */
    private static resolveStreamingProfile(modelId: string): { intervalMs: number; minAudioMs: number; skipAgreement: boolean } {
        // Loose match — covers `onnx-community/moonshine-*`, `usefulsensors/
        // moonshine-*`, and any future fork that keeps "moonshine" in the
        // path. Falls back to Whisper-safe defaults on no match.
        // TODO: validate the 750/400 numbers against measured first-partial
        // p50 once a Moonshine model is downloaded; expect <600ms.
        if (modelId.toLowerCase().includes('moonshine')) {
            return { intervalMs: 750, minAudioMs: 400, skipAgreement: true };
        }
        // Keep LocalAgreement-2 for Whisper stability, but start the first
        // overlapping pass sooner. This only changes interim previews; final
        // VAD segments still use the same full-segment transcription path.
        return { intervalMs: 1000, minAudioMs: 500, skipAgreement: false };
    }

    setSampleRate(rate: number): void { this.inputSampleRate = rate; }
    setAudioChannelCount(_count: number): void {}
    setRecognitionLanguage(key: string): void {
        const normalizedKey = key || 'auto';
        this.language = RECOGNITION_LANGUAGES[normalizedKey]?.bcp47 ?? normalizedKey;
    }
    setCredentials(_credPath: string): void {}

    /**
     * Optional human-readable channel label (e.g. 'mic', 'system') for log
     * disambiguation when both LocalWhisperSTT instances use the same model.
     */
    setChannel(label: string): void { this.channelLabel = (label ?? '').trim(); }

    private diagnosticLabel(): string {
        const modelName = this.modelId.split('/').pop() || this.modelId;
        const channelTag = this.channelLabel ? `:${this.channelLabel}` : '';
        return `[LocalWhisperSTT/${modelName}${channelTag}]`;
    }

    private cleanTranscript(text: string): string {
        return filterHallucination(text);
    }

    private readSegmenterMode(): LocalWhisperSegmenterMode {
        try {
            return SettingsManager.getInstance().get('localWhisperSegmenter') === 'meetily-experiment'
                ? 'meetily-experiment'
                : 'baseline';
        } catch {
            return 'baseline';
        }
    }

    private createSegmenter(mode: LocalWhisperSegmenterMode): Segmenter {
        return mode === 'meetily-experiment'
            ? new MeetilyVadProcessor()
            : new VadProcessor();
    }

    private clearSpeechEndedFlushTimer(): void {
        if (this.speechEndedFlushTimer) {
            clearTimeout(this.speechEndedFlushTimer);
            this.speechEndedFlushTimer = null;
        }
    }

    private handleSegmenterFailure(error: unknown, fallbackAxisMs: number): void {
        if (!this.segmenterFallbackLogged) {
            this.segmenterFallbackLogged = true;
            console.warn(`${this.diagnosticLabel()} segmenter failed; falling back to baseline`, {
                mode: this.segmenterMode,
                error: error instanceof Error ? error.message : String(error),
            });
        }
        this.segmentAxisBaseMs = fallbackAxisMs;
        this.segmentIdBase = this.segmentSequence;
        this.sessionAudioMs = 0;
        this.trackedSegmentId = 0;
        this.segmenterMode = 'baseline';
        this.vad = new VadProcessor();
    }

    private pushSegmentsWithFallback(samples: Float32Array): SpeechSegment[] {
        if (!this.vad) return [];
        try {
            return this.vad.push(samples);
        } catch (error) {
            const durationMs = (samples.length / 16000) * 1000;
            const fallbackAxisMs = this.captureTimeline
                ? Math.max(0, this.captureTimeline.compressedCursorMs - durationMs)
                : this.segmentAxisBaseMs + this.sessionAudioMs;
            this.handleSegmenterFailure(error, fallbackAxisMs);
            return this.vad?.push(samples) ?? [];
        }
    }

    private flushSegmentsWithFallback(): SpeechSegment[] {
        if (!this.vad) return [];
        try {
            return this.vad.flush();
        } catch (error) {
            const fallbackAxisMs = this.captureTimeline?.compressedCursorMs
                ?? this.segmentAxisBaseMs + this.sessionAudioMs;
            this.handleSegmenterFailure(error, fallbackAxisMs);
            return this.vad?.flush() ?? [];
        }
    }

    private normalizeSegment(segment: SpeechSegment): FinalSegmentMetadata {
        const compressedEndMs = this.segmentAxisBaseMs
            + (typeof segment.endMs === 'number' ? segment.endMs : this.sessionAudioMs);
        const compressedStartMs = this.segmentAxisBaseMs
            + (typeof segment.startMs === 'number'
                ? segment.startMs
                : Math.max(0, this.sessionAudioMs - segment.durationMs));
        const mapped = this.captureTimeline?.mapRange(compressedStartMs, compressedEndMs)
            ?? { startMs: compressedStartMs, endMs: compressedEndMs };
        const providerSequenceId = typeof segment.sequenceId === 'number'
            ? this.segmentIdBase + segment.sequenceId
            : undefined;
        const sequenceId = typeof providerSequenceId === 'number' && providerSequenceId > this.segmentSequence
            ? providerSequenceId
            : ++this.segmentSequence;
        this.segmentSequence = Math.max(this.segmentSequence, sequenceId);
        return {
            sessionId: this.sessionGeneration,
            sequenceId,
            startMs: mapped.startMs,
            endMs: mapped.endMs,
            ...(typeof segment.confidence === 'number' ? { confidence: segment.confidence } : {}),
        };
    }

    beginSession(meetingGeneration: number, originMonotonicMs: number): void {
        if (
            this.sessionGeneration === meetingGeneration
            && this.captureTimeline?.originMonotonicMs === originMonotonicMs
        ) return;
        this.sessionGeneration = meetingGeneration;
        this.captureTimeline = new CapturePcmTimelineMapper({ originMonotonicMs });
        this.segmentAxisBaseMs = 0;
        this.sessionAudioMs = 0;
        this.segmentSequence = 0;
        this.segmentIdBase = 0;
    }

    private dispatchSegment(segment: SpeechSegment): void {
        this.dispatchFinal(segment.samples, this.normalizeSegment(segment));
    }

    /**
     * Set a context-biasing prompt (proper nouns, jargon, attendee names).
     * Pushed to the worker out-of-band only when the value actually changes.
     * Empty string disables biasing. Worker truncates to 224 Whisper tokens
     * (front of string preserved) and skips entirely for Moonshine. Safe to
     * call mid-stream — the worker applies the new prompt to subsequent
     * transcribes only; the in-flight one continues with the previous cache.
     */
    setContext(prompt: string): void {
        let trimmed = (prompt ?? '').trim();
        if (trimmed.length > LocalWhisperSTT.PROMPT_MAX_CHARS) {
            trimmed = trimmed.slice(0, LocalWhisperSTT.PROMPT_MAX_CHARS);
        }
        this.contextPrompt = trimmed;
        this.maybePushPromptToWorker();
    }

    private maybePushPromptToWorker(): void {
        if (!this.worker || !this.workerReady) return; // pushed in flushPending after ready
        if (this.contextPrompt === this.contextPromptSentToWorker) return;
        this.worker.postMessage({ type: 'setPrompt', prompt: this.contextPrompt });
        this.contextPromptSentToWorker = this.contextPrompt;
    }

    start(): void {
        if (this.isActive) return;
        // A previous stop may still have an ONNX worker draining finals. A
        // new session must not inherit that worker or its queued PCM; the
        // previous session's tail is already outside the new session boundary.
        const staleWorker = this.worker;
        if (staleWorker) this.beginWorkerTermination(staleWorker, true);
        if (this.pendingAudio.length > 0) {
            console.warn(`${this.diagnosticLabel()} dropping stale pending finals before new session`, {
                pendingFinals: this.pendingAudio.length,
            });
            this.pendingAudio = [];
        }
        if (!this.captureTimeline) {
            this.beginSession(this.sessionGeneration + 1, performance.now());
        }
        const sessionId = this.sessionGeneration;
        this.isDrainingFinals = false;
        this.drainingFinalsInFlight = 0;
        this.clearSpeechEndedFlushTimer();
        this.segmenterMode = this.readSegmenterMode();
        this.segmentAxisBaseMs = this.captureTimeline?.compressedCursorMs ?? 0;
        this.segmentIdBase = this.segmentSequence;
        this.sessionAudioMs = 0;
        this.segmenterFallbackLogged = false;
        this.isActive = true;
        this.vad = this.createSegmenter(this.segmenterMode);
        this.spawnWorker(sessionId).catch((err) => {
            if (sessionId !== this.sessionGeneration) return;
            // Gate refusal or worker spawn failure (e.g. insufficient memory for
            // the ONNX session). There is NO retry path, so we must NOT leave a
            // live streaming loop + VAD churning with worker=null — that silently
            // drops every audio segment (dispatchFinal early-returns on !worker)
            // and leaks a self-chaining 12s streaming timer for the whole session.
            // Tear the instance back down to a clean inactive no-op (write() then
            // no-ops on !isActive/!vad) and surface the error so the supervisor
            // can fall back to cloud STT.
            console.error('[LocalWhisperSTT] spawnWorker failed:', err);
            this.stopStreamingLoop();
            if (this.gapFlushTimer) {
                clearTimeout(this.gapFlushTimer);
                this.gapFlushTimer = null;
            }
            this.vad = null;
            this.isActive = false;
            this.emit('error', err instanceof Error ? err : new Error(String(err)));
        });
        this.startStreamingLoop();
    }

    stop(): void {
        if (!this.isActive) return;
        this.isActive = false;

        this.stopStreamingLoop();
        this.clearSpeechEndedFlushTimer();
        if (this.gapFlushTimer) {
            clearTimeout(this.gapFlushTimer);
            this.gapFlushTimer = null;
        }

        if (this.vad) {
            const segs = this.flushSegmentsWithFallback();
            this.vad = null;
            this.isDrainingFinals = true;
            segs.forEach(s => this.dispatchSegment(s));
        }

        this.resetAgreementState();

        // Print one final latency summary for the just-ended session, then
        // reset windows so the next start() starts with a clean slate.
        if (this.firstPartialLatencies.length > 0 || this.finalLatencies.length > 0) {
            this.logLatencySummary();
        }
        this.firstPartialLatencies = [];
        this.finalLatencies = [];
        this.segmentOpenedAt = 0;
        this.firstPartialEmittedForSegment = 0;
        this.trackedSegmentId = 0;
        this.sessionAudioMs = 0;
        this.latencyLogCounter = 0;

        const w = this.worker;
        if (w) {
            const shouldKeepWorkerForFinals = this.isDrainingFinals && (this.pendingAudio.length > 0 || this.drainingFinalsInFlight > 0);
            if (shouldKeepWorkerForFinals) return;
            this.beginWorkerTermination(w);
        }
    }

    write(chunk: Buffer): void {
        if (!this.isActive || !this.vad) return;
        this.clearSpeechEndedFlushTimer();
        const f32 = resampleToF32(chunk, this.inputSampleRate);
        const chunkDurationMs = (f32.length / 16000) * 1000;
        this.captureTimeline?.appendChunk(chunkDurationMs, performance.now());
        const segs = this.pushSegmentsWithFallback(f32);
        this.sessionAudioMs += chunkDurationMs;
        segs.forEach(s => this.dispatchSegment(s));

        // Soft-commit: if a segment has grown past MAX_SEGMENT_MS, force a
        // final pass and start a new (tail-keep) segment. The softCommit
        // bumps the segment id, so the boundary check below picks it up.
        const open = this.vad.peekOpenSegment();
        if (open && open.durationMs >= LocalWhisperSTT.MAX_SEGMENT_MS) {
            const committed = this.vad.softCommit();
            if (committed) this.dispatchSegment(committed);
        }

        this.captureTimeline?.pruneBefore(Math.max(
            0,
            this.captureTimeline.compressedCursorMs - 30_000,
        ));

        // Telemetry: re-stamp segmentOpenedAt whenever the open VAD segment
        // is a different one than we last tracked. ID-based detection
        // correctly handles open+close-in-one-push (two new segments seen
        // within a single write) and close+open-in-one-push (id rises but
        // isInSpeech stays true).
        if (this.vad.isInSpeech()) {
            const id = this.vad.currentSegmentId();
            if (id !== this.trackedSegmentId) {
                this.trackedSegmentId = id;
                this.segmentOpenedAt = performance.now();
                this.firstPartialEmittedForSegment = 0;
            }
        }

        // Reset gap-flush timer.
        if (this.gapFlushTimer) clearTimeout(this.gapFlushTimer);
        this.gapFlushTimer = setTimeout(() => {
            this.gapFlushTimer = null;
            if (this.isActive && this.vad) {
                const pending = this.flushSegmentsWithFallback();
                pending.forEach(s => this.dispatchSegment(s));
            }
        }, this.segmenterMode === 'meetily-experiment'
            ? MEETILY_VAD_DEFAULTS.redemptionMs + 100
            : LocalWhisperSTT.GAP_FLUSH_MS);
    }

    finalize(): void {
        if (!this.isActive || !this.vad) return;
        this.clearSpeechEndedFlushTimer();
        const segs = this.flushSegmentsWithFallback();
        segs.forEach(s => this.dispatchSegment(s));
    }

    notifySpeechEnded(): void {
        if (!this.isActive || !this.vad) return;
        if (this.segmenterMode === 'baseline') {
            this.finalize();
            return;
        }
        this.clearSpeechEndedFlushTimer();
        this.speechEndedFlushTimer = setTimeout(() => {
            this.speechEndedFlushTimer = null;
            if (this.isActive && this.vad) {
                const segments = this.flushSegmentsWithFallback();
                segments.forEach(s => this.dispatchSegment(s));
            }
        }, MEETILY_VAD_DEFAULTS.redemptionMs + 100);
    }

    /* ──────────────── Streaming inference loop ──────────────── */

    private startStreamingLoop(): void {
        if (this.streamingTimer) return;
        this.streamingNextDelayMs = this.streamingIntervalBaseMs;
        this.streamingStallCount = 0;
        this.scheduleNextStreamingTick();
    }

    private scheduleNextStreamingTick(): void {
        if (!this.isActive) return;
        this.streamingTimer = setTimeout(() => {
            this.streamingTimer = null;
            // Wrap tick in try/catch — a throw here (worker disposed mid-post,
            // VAD nulled, etc.) would otherwise leave the chain unscheduled
            // and silently kill all partials for the rest of the session.
            try {
                this.streamingTick();
            } catch (e) {
                console.warn('[LocalWhisperSTT] streamingTick threw, continuing loop:', e);
                // Treat as a stall so the backoff timer kicks in if the
                // throw is persistent (e.g. recurring postMessage error).
                this.recordStreamingStall();
            }
            this.scheduleNextStreamingTick();
        }, this.streamingNextDelayMs);
    }

    private stopStreamingLoop(): void {
        if (this.streamingTimer) {
            clearTimeout(this.streamingTimer);
            this.streamingTimer = null;
        }
        this.clearStreamingWatchdog();
        this.streamingTaskInFlight = false;
        this.streamingTaskId = null;
        this.streamingStallCount = 0;
        this.streamingNextDelayMs = this.streamingIntervalBaseMs;
    }

    private armStreamingWatchdog(): void {
        this.clearStreamingWatchdog();
        this.streamingWatchdogTimer = setTimeout(() => {
            this.streamingWatchdogTimer = null;
            if (!this.streamingTaskInFlight) return;
            console.warn(`[LocalWhisperSTT] Streaming watchdog fired after ${LocalWhisperSTT.STREAMING_WATCHDOG_MS}ms — worker is stuck, force-clearing in-flight task`);
            const stuckTaskId = this.streamingTaskId;
            this.streamingTaskInFlight = false;
            this.streamingTaskId = null;
            this.streamingStallCount = 0;
            this.streamingNextDelayMs = this.streamingIntervalBaseMs;
            this.emit('error', new Error(
                `Local Whisper streaming task ${stuckTaskId ?? '?'} did not return within ${LocalWhisperSTT.STREAMING_WATCHDOG_MS}ms — worker likely stuck, unblocking next tick.`
            ));
        }, LocalWhisperSTT.STREAMING_WATCHDOG_MS);
    }

    private clearStreamingWatchdog(): void {
        if (this.streamingWatchdogTimer) {
            clearTimeout(this.streamingWatchdogTimer);
            this.streamingWatchdogTimer = null;
        }
    }

    private streamingTick(): void {
        if (!this.isActive || !this.vad || !this.workerReady || !this.worker) {
            this.recordStreamingStall();
            return;
        }
        // Cheap early-return: skip the peekOpenSegment allocation when the
        // VAD isn't currently in a speech segment.
        if (!this.vad.isInSpeech()) { this.recordStreamingStall(); return; }
        // Don't stack streaming requests — wait for the previous one to finish.
        if (this.streamingTaskInFlight) { this.recordStreamingStall(); return; }

        const open = this.vad.peekOpenSegment();
        if (!open || open.durationMs < this.streamingMinAudioMs) {
            this.recordStreamingStall();
            return;
        }

        // Successful dispatch — reset backoff to base interval.
        this.streamingStallCount = 0;
        this.streamingNextDelayMs = this.streamingIntervalBaseMs;

        this.streamingTaskInFlight = true;
        const taskId = `s${++this.taskCounter}`;
        this.streamingTaskId = taskId;
        const copy = open.samples.slice();
        this.armStreamingWatchdog();
        this.worker.postMessage(
            { type: 'transcribe', taskId, audio: copy, language: this.language, streaming: true },
            [copy.buffer]
        );
    }

    private recordStreamingStall(): void {
        this.streamingStallCount++;
        // After 3 consecutive stalls, exponentially back off so we stop
        // spinning while the worker is processing a slow model. Reset only
        // happens on a real dispatch.
        if (this.streamingStallCount >= 3) {
            this.streamingNextDelayMs = Math.min(
                LocalWhisperSTT.STREAMING_INTERVAL_MAX_MS,
                this.streamingNextDelayMs * 2
            );
        }
    }

    /**
     * LocalAgreement-2: commit the longest common prefix between the previous
     * partial and this one. The first partial of a segment seeds the
     * baseline (no emit — agreement requires two passes). Subsequent passes
     * emit only the *new* committed text as an interim transcript.
     */
    private handleStreamingPartial(text: string): void {
        this.clearStreamingWatchdog();
        this.streamingTaskInFlight = false;
        // Worker just became free → recover from any backoff state so the
        // next dispatch fires at the base interval instead of waiting out
        // the doubled delay scheduled while the worker was busy.
        this.streamingStallCount = 0;
        this.streamingNextDelayMs = this.streamingIntervalBaseMs;

        const cleaned = this.cleanTranscript(text);
        if (!cleaned) return;

        // Streaming-class models (Moonshine) produce stable, deterministic
        // output — emit each partial directly. Skipping LA-2's two-pass
        // confirmation cuts an entire tick of latency (~750ms) off the
        // first-text time. The trade-off is occasional flicker on the last
        // word as the model refines, but partial transcripts already carry
        // confidence=0.7 to signal "may change" to consumers.
        if (this.skipAgreement) {
            // Skip duplicate emits when the model produces identical text
            // for consecutive ticks (stable utterance, no new audio).
            if (cleaned !== this.lastEmittedText) {
                this.lastEmittedText = cleaned;
                this.recordFirstPartialLatencyOnce();
                this.emit('transcript', {
                    text: cleaned.trim(),
                    isFinal: false,
                    confidence: 0.7,
                    sttSessionGeneration: this.sessionGeneration,
                    ...(this.trackedSegmentId > 0 ? { segmentId: this.segmentIdBase + this.trackedSegmentId } : {}),
                });
            }
            return;
        }

        // LocalAgreement-2 path (Whisper / Distil-Whisper): need two
        // overlapping passes to converge on a stable committed prefix.
        if (this.lastPartialText === '') {
            this.lastPartialText = cleaned;
            return;
        }

        const agreed = this.longestCommonPrefix(this.lastPartialText, cleaned);
        this.lastPartialText = cleaned;

        if (agreed.length > this.lastEmittedText.length) {
            this.lastEmittedText = agreed;
            this.recordFirstPartialLatencyOnce();
            this.emit('transcript', {
                text: this.lastEmittedText.trim(),
                isFinal: false,
                confidence: 0.7,
                sttSessionGeneration: this.sessionGeneration,
                ...(this.trackedSegmentId > 0 ? { segmentId: this.segmentIdBase + this.trackedSegmentId } : {}),
            });
        }
    }

    private recordFirstPartialLatencyOnce(): void {
        if (this.segmentOpenedAt > 0 && this.firstPartialEmittedForSegment !== this.trackedSegmentId) {
            const dt = performance.now() - this.segmentOpenedAt;
            if (dt > 0 && dt < LocalWhisperSTT.LATENCY_MAX_MS) {
                this.recordLatency(this.firstPartialLatencies, dt);
            }
            this.firstPartialEmittedForSegment = this.trackedSegmentId;
        }
    }

    /* ──────────────── Latency telemetry helpers ──────────────── */

    private recordLatency(arr: number[], ms: number): void {
        arr.push(ms);
        if (arr.length > LocalWhisperSTT.LATENCY_WINDOW) arr.shift();
        this.latencyLogCounter++;
        if (this.latencyLogCounter >= LocalWhisperSTT.LATENCY_LOG_EVERY) {
            this.latencyLogCounter = 0;
            this.logLatencySummary();
        }
    }

    private percentile(sorted: number[], p: number): number {
        if (sorted.length === 0) return 0;
        const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
        return Math.round(sorted[idx]);
    }

    private logLatencySummary(): void {
        const fp = [...this.firstPartialLatencies].sort((a, b) => a - b);
        const fn = [...this.finalLatencies].sort((a, b) => a - b);
        const fmt = (s: number[]) => s.length === 0
            ? 'n=0'
            : `n=${s.length} p50=${this.percentile(s, 50)}ms p95=${this.percentile(s, 95)}ms p99=${this.percentile(s, 99)}ms`;
        console.log(`${this.diagnosticLabel()} latency · first-partial: ${fmt(fp)} · final: ${fmt(fn)}`);
    }

    /** Snapshot for UI / IPC. */
    public getLatencyStats(): { firstPartial: { count: number; p50: number; p95: number; p99: number }; final: { count: number; p50: number; p95: number; p99: number } } {
        const fp = [...this.firstPartialLatencies].sort((a, b) => a - b);
        const fn = [...this.finalLatencies].sort((a, b) => a - b);
        return {
            firstPartial: { count: fp.length, p50: this.percentile(fp, 50), p95: this.percentile(fp, 95), p99: this.percentile(fp, 99) },
            final:        { count: fn.length, p50: this.percentile(fn, 50), p95: this.percentile(fn, 95), p99: this.percentile(fn, 99) },
        };
    }

    private longestCommonPrefix(a: string, b: string): string {
        if (!a || !b) return '';
        const len = Math.min(a.length, b.length);
        let i = 0;
        while (i < len && a[i] === b[i]) i++;
        // Snap back to a word boundary ONLY when we've split mid-word — i.e.
        // both sides of position i are non-whitespace. Without this guard the
        // snap-back walked through the entire prefix and produced ''.
        if (i < a.length && /\S/.test(a[i]) && i > 0 && /\S/.test(a[i - 1])) {
            while (i > 0 && /\S/.test(a[i - 1])) i--;
        }
        return a.slice(0, i);
    }

    private resetAgreementState(): void {
        this.lastPartialText = '';
        this.lastEmittedText = '';
        // Invalidate any in-flight streaming task so its late `partial`
        // response is dropped by the taskId guard below instead of mutating
        // the next segment's agreement baseline.
        this.clearStreamingWatchdog();
        this.streamingTaskId = null;
    }

    /* ──────────────── Final segment dispatch ──────────────── */

    private dispatchFinal(audio: Float32Array, metadata: FinalSegmentMetadata): void {
        // Preserve when the VAD final first entered the STT host. This remains
        // unchanged if the worker is not ready and the final waits in pendingAudio.
        metadata.hostDispatchMonotonicMs ??= performance.now();
        // A final pass closes the streaming window — clear agreement state so
        // the next segment starts clean.
        this.resetAgreementState();
        this.clearStreamingWatchdog();
        this.streamingTaskInFlight = false;

        if (!this.worker || !this.workerReady) {
            const MAX_PENDING = 500;
            if (this.pendingAudio.length < MAX_PENDING) {
                this.pendingAudio.push({ audio: audio.slice(), metadata });
                console.log(`${this.diagnosticLabel()} final queued`, {
                    samples: audio.length,
                    pendingFinals: this.pendingAudio.length,
                    workerPresent: !!this.worker,
                    workerReady: this.workerReady,
                });
            } else {
                console.warn(`${this.diagnosticLabel()} Pending queue full — dropping oldest segment`);
                this.pendingAudio.shift();
                this.pendingAudio.push({ audio: audio.slice(), metadata });
                console.log(`${this.diagnosticLabel()} final queued`, {
                    samples: audio.length,
                    pendingFinals: this.pendingAudio.length,
                    workerPresent: !!this.worker,
                    workerReady: this.workerReady,
                });
            }
            return;
        }

        if (this.isDrainingFinals) {
            this.drainingFinalsInFlight++;
        }
        console.log(`${this.diagnosticLabel()} final dispatch`, {
            samples: audio.length,
            pendingFinals: this.pendingAudio.length,
            isDrainingFinals: this.isDrainingFinals,
            sequenceId: metadata.sequenceId,
        });
        const taskId = `t${++this.taskCounter}`;
        this.finalTaskMetadata.set(taskId, metadata);
        this.stampFinalDispatch(taskId);
        this.sendTranscribe(audio, false, taskId);
    }

    /** Stamp the actual worker-post time used only for same-host round-trip.
     * The earlier VAD/STT-host arrival is retained in FinalSegmentMetadata. */
    private stampFinalDispatch(taskId: string): void {
        this.finalDispatchedAt.set(taskId, performance.now());
    }

    private sendTranscribe(audio: Float32Array, streaming: boolean, taskId?: string): void {
        if (!this.worker) return;
        const resolvedTaskId = taskId ?? `${streaming ? 's' : 't'}${++this.taskCounter}`;
        const copy = audio.slice();
        this.worker.postMessage(
            { type: 'transcribe', taskId: resolvedTaskId, audio: copy, language: this.language, streaming },
            [copy.buffer]
        );
    }

    /* ──────────────── Worker lifecycle ──────────────── */

    private async spawnWorker(sessionId: number): Promise<void> {
        const warm = modelPreloader.takeWarmWorker(this.modelId);
        if (warm) {
            if (sessionId !== this.sessionGeneration) {
                const release = (warm as any).__slotRelease;
                if (typeof release === 'function') release();
                warm.removeAllListeners();
                void warm.terminate().catch(() => {});
                return;
            }
            console.log(`${this.diagnosticLabel()} using preloaded warm worker`, { modelId: this.modelId });
            this.worker = warm;
            this.workerReady = true;
            // Inherit the slot release the preloader acquired. Both preloader
            // and our local listeners will call this — it's a no-op the
            // second time.
            this.slotRelease = (warm as any).__slotRelease ?? null;
            this.attachWorkerListeners(sessionId);
            this.flushPending();
            return;
        }

        // Cold path. Acquire the shared ONNX slot at HIGH priority — Whisper
        // is latency-critical (~750ms real-time streaming) and would deadlock
        // behind a queued embedding batch.
        if (!hasEnoughMemoryForOnnxSession()) {
            const heapGB = (process.memoryUsage().heapUsed / 1024 ** 3).toFixed(1);
            throw new Error(
                `[LocalWhisperSTT] insufficient available memory (<${getMinFreeGBForOnnxSession()}GB) — Whisper init refused (heaped=${heapGB}GB)`,
            );
        }

        const slotRequestedAt = performance.now();
        console.log(`${this.diagnosticLabel()} onnx slot request`, {
            priority: 'high',
            snapshot: getOnnxGateSnapshot(),
        });
        const slotRelease = await acquireOnnxSlot('high');
        if (sessionId !== this.sessionGeneration) {
            slotRelease();
            return;
        }
        this.slotRelease = slotRelease;
        console.log(`${this.diagnosticLabel()} onnx slot acquired`, {
            waitMs: Math.round(performance.now() - slotRequestedAt),
            snapshot: getOnnxGateSnapshot(),
        });

        console.log(`${this.diagnosticLabel()} worker spawn`, { modelId: this.modelId });
        const workerPath = resolveWhisperWorkerPath();
        writeLoadSentinel(this.modelId);
        this.worker = new Worker(workerPath);
        this.attachWorkerListeners(sessionId);
        this.worker.postMessage(buildWorkerInitMessage(this.modelId));
    }

    private handleWorkerFailure(worker: Worker, sessionId: number, error: Error): void {
        if (this.worker !== worker || this.sessionGeneration !== sessionId) return;

        // A process-level worker failure is terminal for this STT instance.
        // Drop state that could otherwise keep queueing audio behind a dead
        // worker; the next meeting start creates a fresh session.
        this.stopStreamingLoop();
        this.clearSpeechEndedFlushTimer();
        if (this.gapFlushTimer) {
            clearTimeout(this.gapFlushTimer);
            this.gapFlushTimer = null;
        }
        this.isActive = false;
        this.vad = null;
        this.pendingAudio = [];
        this.finalTaskMetadata.clear();
        this.finalDispatchedAt.clear();
        this.isDrainingFinals = false;
        this.drainingFinalsInFlight = 0;
        this.workerReady = false;
        modelPreloader.recordLoadFailure(this.modelId);

        // Remove listeners before terminate() so a paired error/exit event
        // cannot execute this cleanup twice. Slot release happens in the
        // termination promise's finally block.
        this.beginWorkerTermination(worker, true);
        this.emit('error', error);
    }

    private attachWorkerListeners(sessionId: number): void {
        const worker = this.worker;
        if (!worker) return;

        worker.on('message', (msg: WorkerOutMessage) => {
            // A late event from a worker that has already been replaced must
            // never mutate the replacement session's state.
            if (this.worker !== worker || this.sessionGeneration !== sessionId) return;
            if (msg.type === 'ready') {
                clearLoadSentinel(this.modelId);
                this.workerReady = true;
                console.log(`${this.diagnosticLabel()} worker ready`, {
                    pendingFinals: this.pendingAudio.length,
                    isDrainingFinals: this.isDrainingFinals,
                });
                this.flushPending();
                return;
            }

            // After stop(), allow only the explicitly flushed final segments to
            // return during the 5s drain window; partials and unrelated worker
            // messages remain ignored on a torn-down instance.
            if (!this.isActive && !(this.isDrainingFinals && msg.type === 'result')) return;

            if (msg.type === 'partial') {
                // Drop partials whose segment has already been finalized — the
                // agreement baseline is reset on every final dispatch and the
                // taskId is invalidated, so a late partial would otherwise
                // corrupt the next segment.
                if (msg.taskId !== this.streamingTaskId) {
                    this.streamingTaskInFlight = false;
                    return;
                }
                this.handleStreamingPartial(msg.text);
            } else if (msg.type === 'result') {
                const metadata = this.finalTaskMetadata.get(msg.taskId);
                this.finalTaskMetadata.delete(msg.taskId);
                // Phase 18 Step 2 diagnostic-only: host-local round trip,
                // same-host performance.now() duration. Never mixed with the
                // worker's own internal (separate-clock) timings.
                const dispatchedAt = this.finalDispatchedAt.get(msg.taskId);
                this.finalDispatchedAt.delete(msg.taskId);
                const hostRoundTripMs = typeof dispatchedAt === 'number'
                    ? Math.round(performance.now() - dispatchedAt)
                    : undefined;
                if (metadata && metadata.sessionId !== this.sessionGeneration) return;
                const text = this.cleanTranscript(msg.text);
                if (text) {
                    if (this.segmentOpenedAt > 0) {
                        const dt = performance.now() - this.segmentOpenedAt;
                        if (dt > 0 && dt < LocalWhisperSTT.LATENCY_MAX_MS) {
                            this.recordLatency(this.finalLatencies, dt);
                        }
                    }
                    this.emit('transcript', {
                        text,
                        isFinal: true,
                        confidence: 0.9,
                        sttSessionGeneration: metadata?.sessionId ?? this.sessionGeneration,
                        ...(metadata ? {
                            segmentId: metadata.sequenceId,
                            audioStartMs: metadata.startMs,
                            audioEndMs: metadata.endMs,
                        } : {}),
                        diagnostics: {
                            sttSessionGeneration: this.sessionGeneration,
                            // Phase 18 Step 2 fix: carry the actual dispatch-time
                            // monotonic stamp (host clock) so the renderer can
                            // materialize a genuine stt-dispatch boundary, not
                            // just the derived round-trip duration.
                            ...(typeof metadata?.hostDispatchMonotonicMs === 'number' ? { hostDispatchMonotonicMs: Math.round(metadata.hostDispatchMonotonicMs) } : {}),
                            ...(msg.diagnostics?.workerQueueWaitMs !== undefined ? { workerQueueWaitMs: msg.diagnostics.workerQueueWaitMs } : {}),
                            ...(msg.diagnostics?.workerInferenceMs !== undefined ? { workerInferenceMs: msg.diagnostics.workerInferenceMs } : {}),
                            ...(hostRoundTripMs !== undefined ? { hostRoundTripMs } : {}),
                            textLength: text.length,
                        },
                    });
                }
                // Reset segment timer regardless of emit (silent finals also close
                // the segment). Next write() that opens a fresh VAD segment will
                // re-stamp via the segment-id check.
                this.segmentOpenedAt = 0;
                if (this.isDrainingFinals) {
                    this.drainingFinalsInFlight = Math.max(0, this.drainingFinalsInFlight - 1);
                    if (this.drainingFinalsInFlight === 0 && this.worker) {
                        this.beginWorkerTermination(this.worker);
                    }
                }
            } else if (msg.type === 'error') {
                console.error('[LocalWhisperSTT] Worker error:', msg.message);
                if (msg.taskId) this.finalTaskMetadata.delete(msg.taskId);
                if (this.isDrainingFinals && msg.taskId?.startsWith('t')) {
                    this.drainingFinalsInFlight = Math.max(0, this.drainingFinalsInFlight - 1);
                    if (this.drainingFinalsInFlight === 0 && this.worker) {
                        this.beginWorkerTermination(this.worker);
                    }
                }
                // If the failed task was the in-flight streaming one, unblock
                // the loop so the next tick can fire.
                if (msg.taskId && msg.taskId === this.streamingTaskId) {
                    this.streamingTaskInFlight = false;
                    this.streamingTaskId = null;
                    // Worker is free again; reset backoff so next tick is prompt.
                    this.streamingStallCount = 0;
                    this.streamingNextDelayMs = this.streamingIntervalBaseMs;
                }
                if (msg.message.includes('Failed to load model')) {
                    const isOnnxSymbolError = msg.message.includes('Symbol not found')
                        || msg.message.includes('__ZNSt3__18to_charsEPcS0_d')
                        || msg.message.includes('libonnxruntime');
                    this.emit('error', new Error(
                        isOnnxSymbolError
                            ? 'Local Whisper is not supported on macOS 12 (Monterey) or earlier. Please upgrade to macOS 13 Ventura or later, or use a cloud STT provider.'
                            : 'Local Whisper model not found. Please download a model in Settings → Audio.'
                    ));
                }
            }
        });

        worker.on('error', (err) => {
            if (this.worker !== worker || this.sessionGeneration !== sessionId) return;
            const processIsOnnxSymbolError = err.message.includes('Symbol not found')
                || err.message.includes('to_chars')
                || err.message.includes('libonnxruntime');
            const failure = processIsOnnxSymbolError
                ? new Error('Local Whisper is not supported on macOS 12 (Monterey) or earlier. Please upgrade to macOS 13 Ventura or later, or use a cloud STT provider.')
                : err;
            this.handleWorkerFailure(worker, sessionId, failure);
        });

        // 'exit' fires whenever the worker terminates (voluntarily or not),
        // including the 'error' path above. If the worker is gone, the
        // streaming loop must be unblocked — otherwise streamingTaskInFlight
        // stays true and the next tick silently stalls forever.
        worker.on('exit', (code) => {
            if (this.worker !== worker || this.sessionGeneration !== sessionId) return;
            this.handleWorkerFailure(
                worker,
                sessionId,
                new Error(`Local Whisper worker exited unexpectedly (code=${code}) — transcription has stopped; start a new session to recover.`),
            );

        });
    }

    private flushPending(): void {
        // Push the cached prompt to the worker FIRST so the queued transcribes
        // see the bias on their initial run (worker honors the latest cached
        // prompt for whichever transcribe arrives next).
        this.maybePushPromptToWorker();
        const queued = this.pendingAudio.splice(0).filter(({ metadata }) => metadata.sessionId === this.sessionGeneration);
        queued.forEach(({ audio, metadata }) => {
            if (this.isDrainingFinals) {
                this.drainingFinalsInFlight++;
            }
            const taskId = `t${++this.taskCounter}`;
            this.finalTaskMetadata.set(taskId, metadata);
            // Phase 18 Step 2 fix: queued finals are posted to the worker
            // here, not in dispatchFinal, so the host round-trip clock must
            // be stamped at this actual dispatch point too — otherwise
            // hostRoundTripMs is silently missing for every queued final.
            this.stampFinalDispatch(taskId);
            this.sendTranscribe(audio, false, taskId);
        });
        if (this.isDrainingFinals && queued.length === 0 && this.drainingFinalsInFlight === 0 && this.worker) {
            this.beginWorkerTermination(this.worker);
        }
    }

    private beginWorkerTermination(w: Worker, immediate = false): void {
        if (this.workerTerminateTimers.has(w)) return;

        const isCurrentWorker = this.worker === w;
        const release = isCurrentWorker ? this.slotRelease : null;
        if (isCurrentWorker) {
            this.worker = null;
            this.workerReady = false;
            this.isDrainingFinals = false;
            this.drainingFinalsInFlight = 0;
            this.finalTaskMetadata.clear();
            this.slotRelease = null;
            // Reset the sent-prompt tracker: a future spawnWorker call will
            // get a fresh worker with empty cache.
            this.contextPromptSentToWorker = '';
        }

        // No callbacks should run while the worker is in its grace window.
        w.removeAllListeners('message');
        w.removeAllListeners('error');
        w.removeAllListeners('exit');

        const terminate = async (): Promise<void> => {
            try {
                await w.terminate();
            } catch {
                // The worker may already have exited; slot cleanup still
                // needs to happen in the finally path.
            } finally {
                release?.();
            }
        };

        if (immediate) {
            void terminate();
            return;
        }

        const timer = setTimeout(() => {
            this.workerTerminateTimers.delete(w);
            void terminate();
        }, 5000);
        // unref so the timer doesn't pin the Node event loop on app quit.
        (timer as any).unref?.();
        this.workerTerminateTimers.set(w, timer);
    }
}
