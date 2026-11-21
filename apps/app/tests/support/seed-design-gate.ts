// The publish gate and the repo's decoders on the official designs the
// community seed publishes, split into shards (tests/database/
// seed-designs-gate-*.test.ts), and the gate score the seed stores for each
// checked to be the one the gate gives. Each design is a test of its own
// with the default per-test timeout, so the time a shard takes grows with
// the library while no one design's limit does. The Frame scan workflow
// (QRDX_FRAME_SCAN_PART=<i>/<n>, packages/qrdx/scripts/official-frames/
// sample.mjs) splits the designs across its jobs as it does the frames.
// The fast checks (no two alike, no scan-risk flag, contrast, coverage)
// are in tests/database/seed-designs.test.ts.
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

const { checkScanGate } = await import("@/lib/community/scan-gate");
const {
  cleanupDecoders,
  DECODERS,
  decodeFailures,
  SCORES_UPDATE,
  seededDesigns,
  shownStyle,
} = await import("./seed-designs");
const { framePart, framePartLabel, shardOf } = await import(
  "../../../../packages/qrdx/scripts/official-frames/sample.mjs"
);

/** Gates shard `index` (1-based) of `count` of the seeded designs. */
export function describeSeedDesignGate(index: number, count: number) {
  const designs: ReturnType<typeof seededDesigns> = shardOf(
    framePart(seededDesigns()),
    index,
    count,
  );

  describe(`the seed's official designs${framePartLabel()} (shard ${index} of ${count})`, () => {
    afterAll(() => cleanupDecoders());

    it("has designs to gate", () => {
      expect(designs.length).toBeGreaterThan(0);
    });

    it.each(designs.map((item) => [item.ref, item] as const))(
      `%s scans Great with the publish gate, as its stored score says, and reads with ${DECODERS}`,
      async (_ref, item) => {
        const style = shownStyle(item);
        const gate = await checkScanGate(style);
        expect(
          gate.passed,
          gate.results.map((r) => `${r.sample}=${r.score}`).join(" "),
        ).toBe(true);
        expect(gate.minScore, SCORES_UPDATE).toBe(item.scanScore);
        expect(await decodeFailures(style, item.slug)).toEqual([]);
      },
    );
  });
}
