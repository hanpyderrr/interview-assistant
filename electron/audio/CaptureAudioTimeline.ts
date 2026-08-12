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
        if (!Number.isInteger(sessionGeneration) || sessionGeneration < 0) {
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
        if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
            throw new RangeError('PCM sample rate must be finite and positive');
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
        if (!Number.isFinite(captureEndMs)) {
            throw new RangeError('PCM chunk produces an invalid capture end time');
        }

        this.channelCursors[channel] = captureEndMs;
        return { bytes, captureStartMs, captureEndMs };
    }
}
