export type CaptureChannel = 'interviewer' | 'user';

export interface CapturedPcmChunk {
    bytes: Buffer;
    captureStartMs: number;
    captureEndMs: number;
}

export class CaptureAudioTimeline {
    private sessionGeneration: number | undefined;
    private originMonotonicMs: number | undefined;
    private channelCursors: Record<CaptureChannel, number | undefined> = {
        interviewer: undefined,
        user: undefined,
    };

    beginSession(sessionGeneration: number, originMonotonicMs: number): void {
        if (!Number.isSafeInteger(sessionGeneration) || sessionGeneration < 0) {
            throw new RangeError('Session generation must be a non-negative integer');
        }
        if (!Number.isFinite(originMonotonicMs) || originMonotonicMs < 0) {
            throw new RangeError('Session origin monotonic time must be finite and non-negative');
        }
        if (this.sessionGeneration === sessionGeneration) {
            if (this.originMonotonicMs !== originMonotonicMs) {
                throw new Error(`Session generation ${sessionGeneration} cannot change its origin`);
            }
            return;
        }
        if (
            this.sessionGeneration !== undefined
            && sessionGeneration < this.sessionGeneration
        ) {
            throw new Error('Session generation must not move backwards');
        }

        this.sessionGeneration = sessionGeneration;
        this.originMonotonicMs = originMonotonicMs;
        this.channelCursors = {
            interviewer: undefined,
            user: undefined,
        };
    }

    stamp(
        channel: CaptureChannel,
        bytes: Buffer,
        sampleRate: number,
        nowMonotonicMs: number,
    ): CapturedPcmChunk {
        const originMonotonicMs = this.originMonotonicMs;
        if (originMonotonicMs === undefined) {
            throw new Error('Capture timeline session has not begun');
        }
        if (channel !== 'interviewer' && channel !== 'user') {
            throw new TypeError('Capture channel must be interviewer or user');
        }
        if (!Buffer.isBuffer(bytes)) {
            throw new TypeError('PCM bytes must be a Buffer');
        }
        if (bytes.length === 0) {
            throw new RangeError('PCM buffer must not be empty');
        }
        if (bytes.length % 2 !== 0) {
            throw new RangeError('PCM S16LE buffer must contain an even number of bytes');
        }
        if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) {
            throw new RangeError('PCM sample rate must be a positive safe integer');
        }
        if (
            !Number.isFinite(nowMonotonicMs)
            || nowMonotonicMs < originMonotonicMs
        ) {
            throw new RangeError('Current monotonic time must be finite and at or after the session origin');
        }

        const durationMs = (bytes.length / 2 / sampleRate) * 1_000;
        if (!Number.isFinite(durationMs)) {
            throw new RangeError('PCM sample rate produces an invalid duration');
        }
        const arrivalStartMs = nowMonotonicMs - originMonotonicMs - durationMs;
        const captureStartMs = Math.max(this.channelCursors[channel] ?? 0, arrivalStartMs);
        const captureEndMs = captureStartMs + durationMs;
        if (!Number.isFinite(captureEndMs) || captureEndMs <= captureStartMs) {
            throw new RangeError('PCM chunk must produce a capture end time after its start');
        }

        this.channelCursors[channel] = captureEndMs;
        return { bytes, captureStartMs, captureEndMs };
    }
}
