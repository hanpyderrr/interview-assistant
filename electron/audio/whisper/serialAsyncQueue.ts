export type SerialQueueErrorHandler<T> = (error: unknown, item: T) => void;

export interface SerialAsyncQueue<T> {
  enqueue(item: T): void;
  idle(): Promise<void>;
  close(): void;
}

/** Run async worker messages one at a time while retaining FIFO order. */
export function createSerialAsyncQueue<T>(
  handler: (item: T) => Promise<void> | void,
  onError: SerialQueueErrorHandler<T> = () => {},
): SerialAsyncQueue<T> {
  const pending: T[] = [];
  const idleWaiters: Array<() => void> = [];
  let running = false;
  let closed = false;

  const resolveIdle = (): void => {
    if (running || pending.length > 0) return;
    while (idleWaiters.length > 0) idleWaiters.shift()?.();
  };

  const drain = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      while (!closed && pending.length > 0) {
        const item = pending.shift() as T;
        try {
          await handler(item);
        } catch (error) {
          try {
            onError(error, item);
          } catch {
            // Error reporting must not stop later messages from draining.
          }
        }
      }
    } finally {
      running = false;
      resolveIdle();
      // A message can be enqueued at the exact point the loop finishes.
      if (!closed && pending.length > 0) void drain();
    }
  };

  return {
    enqueue(item: T): void {
      if (closed) return;
      pending.push(item);
      void drain();
    },
    idle(): Promise<void> {
      if (!running && pending.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => idleWaiters.push(resolve));
    },
    close(): void {
      closed = true;
      pending.length = 0;
      resolveIdle();
    },
  };
}
