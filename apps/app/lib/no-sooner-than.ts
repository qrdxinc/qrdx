/**
 * Runs `work` and settles on a whole multiple of `ms` after it started (at
 * `ms`, or `2 × ms`, `3 × ms` … when the work runs longer), whether it
 * resolves or throws. How long the answer took then says nothing about which
 * way `work` went, unless the two ways happen to straddle a step: a slow
 * request (a cold instance, a slow database) still lands on the same step as
 * any other request that ran between the same two multiples.
 */
export async function noSoonerThan<T>(
  ms: number,
  work: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    return await work();
  } finally {
    const elapsed = performance.now() - started;
    const left = Math.max(1, Math.ceil(elapsed / ms)) * ms - elapsed;
    if (left > 0) {
      await new Promise((resolve) => setTimeout(resolve, left));
    }
  }
}
