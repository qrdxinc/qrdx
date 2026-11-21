// The publish gate (lib/community/scan-gate.ts, the real server scorer) on
// the engine's official frames (qrdx OFFICIAL_FRAMES), drawn as their
// community cards draw them: the hand-made ones and the day's rotating
// sample on a normal run, every frame with QRDX_FULL_FRAME_SCAN=1
// (packages/qrdx/scripts/official-frames/sample.mjs), split into shards
// (tests/community/official-frames-gate-*.test.ts). Every frame is also
// checked to scan in the engine's own tests.
//
// Each frame is a test of its own, with the default per-test timeout: a
// frame takes about a second, so the time a shard takes grows with the
// library while no one frame's limit does.
import { OFFICIAL_FRAMES } from "qrdx";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

const { officialFramePreview } = await import("@/lib/community/catalog");
const { checkScanGate } = await import("@/lib/community/scan-gate");
const { framePart, framePartLabel, frameScanPlan, fullFrameScan, shardOf } =
  await import("../../../../packages/qrdx/scripts/official-frames/sample.mjs");

type OfficialFrame = (typeof OFFICIAL_FRAMES)[number];

/** Gates shard `index` (1-based) of `count` of the official frames. */
export function describeOfficialFrameGate(index: number, count: number) {
  const plan = frameScanPlan(OFFICIAL_FRAMES.map((frame) => frame.id));
  const gated = new Set(plan.full);
  const frames: OfficialFrame[] = shardOf(
    framePart(OFFICIAL_FRAMES.filter((frame) => gated.has(frame.id))),
    index,
    count,
  );

  const label = fullFrameScan() ? "every frame" : `day ${plan.day}`;
  describe(`the official frames (${label}${framePartLabel()}, shard ${index} of ${count})`, () => {
    it("has frames to gate", () => {
      expect(frames.length).toBeGreaterThan(0);
    });

    it.each(frames.map((frame) => [frame.id, frame] as const))(
      "%s scans Great with the publish gate",
      async (_id, frame) => {
        const gate = await checkScanGate(officialFramePreview(frame));
        expect(
          gate.passed,
          gate.results.map((r) => `${r.sample}=${r.score}`).join(" "),
        ).toBe(true);
      },
    );
  });
}
