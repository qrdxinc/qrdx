import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { noSoonerThan } from "@/lib/no-sooner-than";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const takes = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** How long after the start `pending` settled, once the clock has moved. */
async function settledAfter(pending: Promise<unknown>, advance: number) {
  const started = Date.now();
  let at: number | undefined;
  pending.then(
    () => {
      at = Date.now() - started;
    },
    () => {
      at = Date.now() - started;
    },
  );
  await vi.advanceTimersByTimeAsync(advance);
  return at;
}

describe("noSoonerThan", () => {
  it("answers no sooner than the minimum when the work is quicker", async () => {
    const pending = noSoonerThan(750, async () => {
      await takes(40);
      return "done";
    });
    expect(await settledAfter(pending, 749)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe("done");
  });

  it("holds a failure back the same way, then passes it on", async () => {
    const boom = new Error("boom");
    const pending = noSoonerThan(750, async () => {
      throw boom;
    });
    pending.catch(() => undefined);
    expect(await settledAfter(pending, 749)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).rejects.toBe(boom);
  });

  it("adds nothing when the work takes longer than the minimum", async () => {
    const pending = noSoonerThan(750, async () => {
      await takes(900);
      return "slow";
    });
    expect(await settledAfter(pending, 900)).toBe(900);
    expect(await pending).toBe("slow");
  });
});
