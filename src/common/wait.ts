import { SodexError } from "./errors";

export interface PollOptions<T> {
  /** Total wait budget. Defaults to 120 seconds. */
  timeoutMs?: number;
  /** Delay between attempts. Defaults to 3 seconds. */
  intervalMs?: number;
  /** Cancels both the current wait and the delay before the next attempt. */
  signal?: AbortSignal;
  /** Called after every successful poll, including the final value. */
  onUpdate?: (value: T) => void;
}

export class WaitTimeoutError extends SodexError {
  constructor(
    public readonly operation: string,
    public readonly timeoutMs: number,
  ) {
    super(`${operation} timed out after ${timeoutMs} ms`);
    this.name = "WaitTimeoutError";
  }
}

export class WaitAbortedError extends SodexError {
  public override readonly cause?: unknown;

  constructor(
    public readonly operation: string,
    cause?: unknown,
  ) {
    super(`${operation} was aborted`);
    this.name = "WaitAbortedError";
    this.cause = cause;
  }
}

/** Reusable, abort-aware polling primitive used by the SDK workflow helpers. */
export async function pollUntil<T>(
  operation: string,
  load: () => Promise<T>,
  done: (value: T) => boolean,
  options: PollOptions<T> = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 3_000;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    assertNotAborted(operation, options.signal);
    const value = await waitForAttempt(operation, load, deadline, timeoutMs, options.signal);
    options.onUpdate?.(value);
    if (done(value)) return value;
    if (Date.now() >= deadline) throw new WaitTimeoutError(operation, timeoutMs);
    await waitDelay(
      operation,
      Math.min(intervalMs, Math.max(0, deadline - Date.now())),
      options.signal,
    );
  }
}

function waitForAttempt<T>(
  operation: string,
  load: () => Promise<T>,
  deadline: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (result: { value: T } | { error: unknown }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if ("error" in result) reject(result.error);
      else resolve(result.value);
    };
    const abort = () => finish({ error: new WaitAbortedError(operation, signal?.reason) });
    const timer = setTimeout(
      () => finish({ error: new WaitTimeoutError(operation, timeoutMs) }),
      Math.max(0, deadline - Date.now()),
    );
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    load().then(
      (value) => finish({ value }),
      (error) => finish({ error }),
    );
  });
}

function assertNotAborted(operation: string, signal?: AbortSignal): void {
  if (signal?.aborted) throw new WaitAbortedError(operation, signal.reason);
}

async function waitDelay(operation: string, delayMs: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, delayMs);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new WaitAbortedError(operation, signal?.reason));
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}
