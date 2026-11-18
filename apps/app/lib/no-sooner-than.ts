/**
 * Runs `work` and settles no sooner than `ms` after it started, whether it
 * resolves or throws. How long the answer took then says nothing about which
 * way `work` went, unless that way alone takes longer than `ms`.
 */
export async function noSoonerThan<T>(
  ms: number,
  work: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    return await work();
  } finally {
    const left = ms - (performance.now() - started);
    if (left > 0) {
      await new Promise((resolve) => setTimeout(resolve, left));
    }
  }
}
