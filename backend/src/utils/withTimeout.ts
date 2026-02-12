/** Generic timeout wrapper. Rejects with 'Timed out' if the promise doesn't settle within ms. */

import type { ChildProcess } from 'node:child_process';

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
      reject(new Error('Timed out'));
    }, ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}
