// The halo rule in the editor (control-sections/halo-rules.ts, and the
// Dots picker's pair rules): with a see-through background a halo is
// blocked with the dot shapes the engine refuses it for, both from the
// Halo section and when picking such a shape while a halo is on.
import { HALO_SEE_THROUGH_BLOCKED_BODIES } from "qrdx";
import { describe, expect, it } from "vitest";
import {
  haloBlocked,
  haloRisk,
} from "@/components/editor/control-sections/halo-rules";
import {
  pairBlocked,
  pairRisk,
} from "@/components/editor/control-sections/pair-rules";
import type { QRStyle } from "@/types/theme";

const base: Partial<QRStyle> = {
  bgColor: "transparent",
  cornerEyePattern: "rounded",
  cornerEyeDotPattern: "rounded",
};

describe("halo rules", () => {
  it("blocks the halo on a see-through background with a refused dot shape", () => {
    for (const body of HALO_SEE_THROUGH_BLOCKED_BODIES) {
      expect(haloRisk({ ...base, bodyPattern: body })?.fix, body).toContain(
        "opaque background",
      );
      expect(haloBlocked({ ...base, bodyPattern: body, halo: {} }), body).toBe(
        true,
      );
      // Nothing to block without a halo, or on an opaque background
      expect(haloBlocked({ ...base, bodyPattern: body })).toBe(false);
      expect(
        haloBlocked({
          ...base,
          bgColor: "#ffffff",
          bodyPattern: body,
          halo: {},
        }),
      ).toBe(false);
    }
    expect(haloRisk({ ...base, bodyPattern: "rounded" })).toBeNull();
  });

  it("blocks picking a refused dot shape while a halo is on", () => {
    const withHalo = { ...base, bodyPattern: "rounded" as const, halo: {} };
    expect(pairBlocked(withHalo, { bodyPattern: "diamond" })).toBe(true);
    expect(pairRisk(withHalo, { bodyPattern: "diamond" })).toContain(
      "diamond dots",
    );
    expect(pairBlocked(withHalo, { bodyPattern: "circle" })).toBe(false);
    expect(pairRisk(withHalo, { bodyPattern: "circle" })).toBeNull();
    // Without a halo, or with an opaque background, the shape is free
    expect(
      pairBlocked(
        { ...base, bodyPattern: "rounded" },
        { bodyPattern: "diamond" },
      ),
    ).toBe(false);
    expect(
      pairBlocked(
        { ...withHalo, bgColor: "#f8fafc" },
        { bodyPattern: "diamond" },
      ),
    ).toBe(false);
  });
});
