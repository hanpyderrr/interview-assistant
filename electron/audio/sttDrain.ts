export type SttDrainResult = 'completed' | 'timed-out';

export interface SttDrainOptions {
    minimumWaitMs?: number;
    setTimeout?: (callback: () => void, delayMs: number) => unknown;
    clearTimeout?: (timer: unknown) => void;
}

export async function waitForSttDrain(
    promises: readonly PromiseLike<unknown>[],
    timeoutMs: number,
    options: SttDrainOptions = {},
): Promise<SttDrainResult> {
    const minimumWaitMs = options.minimumWaitMs ?? 0;
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
        throw new RangeError('STT drain timeout must be finite and non-negative');
    }
    if (!Number.isFinite(minimumWaitMs) || minimumWaitMs < 0 || minimumWaitMs > timeoutMs) {
        throw new RangeError('STT drain minimum wait must be between zero and the timeout');
    }

    const schedule = options.setTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    const cancel = options.clearTimeout ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
    let deadlineTimer: unknown;
    let minimumTimer: unknown;

    const settled = Promise.allSettled(promises);
    const minimumWait = minimumWaitMs === 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            minimumTimer = schedule(resolve, minimumWaitMs);
        });
    const completed = Promise.all([settled, minimumWait]).then((): SttDrainResult => 'completed');
    const timedOut = new Promise<SttDrainResult>((resolve) => {
        deadlineTimer = schedule(() => resolve('timed-out'), timeoutMs);
    });

    try {
        return await Promise.race([completed, timedOut]);
    } finally {
        if (deadlineTimer !== undefined) cancel(deadlineTimer);
        if (minimumTimer !== undefined) cancel(minimumTimer);
    }
}
