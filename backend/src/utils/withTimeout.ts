/** Generic timeout wrapper. Rejects with TimeoutError if the promise doesn't settle within ms. */

import type { ChildProcess } from 'node:child_process';

/** Custom error class for timeout detection via instanceof. */
export class TimeoutError extends Error {
  constructor(message = 'Timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export interface WithTimeoutOptions {
  /** If provided, the child process is killed on timeout so it doesn't leak. */
  childProcess?: ChildProcess;
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  options?: WithTimeoutOptions,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (options?.childProcess) {
        try { options.childProcess.kill(); } catch { /* best-effort */ }
      }
      reject(new TimeoutError());
    }, ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}
