// The halo rule in the editor (control-sections/halo-rules.ts): whether a
// halo is drawn depends on the background only (qrdx getHaloRisk), and any
// rim color is drawn, moved into the range decoders read where it isn't
// (qrdx fitHaloColor), so no shape picker blocks for it, the Halo switch
// always turns a halo off, and the background picker offers no see-through
// or picture fill while a halo is on. Review finding 1: a halo on diamond
// dots over an opaque background, then a see-through background, left the
// switch off and disabled and every eye preset blocked. The owner's report
// (22 Nov 2026): a dark red rim on white was refused, so the color control
// looked dead.

import { fitHaloColor, getHaloRisk } from "qrdx";
import {
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  HALO_LIGHT_MIN,
} from "qrdx/types";
import { describe, expect, it } from "vitest";
import {
  backgroundPickerFor,
  haloDotTints,
  haloDrawnAs,
  haloRisk,
  haloSwitch,
  haloToTurnOn,
} from "@/components/editor/control-sections/halo-rules";
import {
  pairBlocked,
  pairRisk,
} from "@/components/editor/control-sections/pair-rules";
import { EYE_PRESETS } from "@/components/editor/control-sections/shape-catalog";
import { QR_IMAGE_KINDS } from "@/components/editor/paint-picker/paint-panel";
import { randomEyes } from "@/components/editor/part-inline/random-part";
import type { QRStyle } from "@/types/theme";

const opaque: Partial<QRStyle> = {
  bgColor: "#ffffff",
  bodyPattern: "diamond",
  cornerEyePattern: "rounded",
  cornerEyeDotPattern: "rounded",
};

describe("halo rules", () => {
  it("never strands the editor: a halo on, then a see-through background", () => {
    // A halo on diamond dots over an opaque background: drawn
    const on = { ...opaque, halo: {} };
    expect(haloRisk(on)).toBeNull();
    // The background goes see-through (the picker still offered it before)
    const stuck = { ...on, bgColor: "#ffffff00" };
    expect(haloRisk(stuck)?.reason).toBe("see-through");
    // The switch shows the halo on and can turn it off
    expect(haloSwitch(stuck)).toEqual({ checked: true, disabled: false });
    // No eye preset, frame or centre is blocked for the halo: each is blocked
    // exactly as without one
    const { halo: _halo, ...noHalo } = stuck;
    for (const preset of EYE_PRESETS) {
      const change = {
        cornerEyePattern: preset.outer,
        cornerEyeDotPattern: preset.centre,
      };
      expect(pairBlocked(stuck, change), preset.id).toBe(
        pairBlocked(noHalo, change),
      );
      expect(pairRisk(stuck, change), preset.id).toBe(pairRisk(noHalo, change));
    }
    for (const cornerEyePattern of CORNER_EYE_PATTERNS) {
      expect(pairBlocked(stuck, { cornerEyePattern }), cornerEyePattern).toBe(
        pairBlocked(noHalo, { cornerEyePattern }),
      );
    }
    for (const cornerEyeDotPattern of CORNER_EYE_DOT_PATTERNS) {
      expect(
        pairBlocked(stuck, { cornerEyeDotPattern }),
        cornerEyeDotPattern,
      ).toBe(pairBlocked(noHalo, { cornerEyeDotPattern }));
    }
    expect(randomEyes(stuck, () => 0.5)).not.toBeNull();
    // Turning it off clears the state
    expect(haloSwitch(noHalo)).toEqual({ checked: false, disabled: true });
    expect(haloSwitch({ ...noHalo, bgColor: "#ffffff" })).toEqual({
      checked: false,
      disabled: false,
    });
  });

  it("turns on a rim the background takes", () => {
    expect(haloToTurnOn({ bgColor: "#ffffff" })).toEqual({});
    // The default rim (#e5e7eb) is lighter than this background
    const grey = { bgColor: "#dcdfe3" };
    expect(haloToTurnOn(grey)).toEqual({ color: HALO_LIGHT_MIN });
    expect(haloSwitch(grey)).toEqual({ checked: false, disabled: false });
    expect(haloRisk({ ...grey, halo: haloToTurnOn(grey) })).toBeNull();
    // Nothing fits a background darker than HALO_LIGHT_MIN
    expect(haloSwitch({ bgColor: "#9ca3af" }).disabled).toBe(true);
  });

  it("blocks no dot shape for a halo", () => {
    const on = { ...opaque, halo: {} };
    for (const bodyPattern of ["diamond", "small-square", "star"] as const) {
      expect(pairBlocked(on, { bodyPattern }), bodyPattern).toBe(
        pairBlocked(opaque, { bodyPattern }),
      );
    }
  });

  it("keeps the background opaque and solid while a halo is on", () => {
    expect(backgroundPickerFor(opaque, QR_IMAGE_KINDS)).toEqual({
      alpha: true,
      kinds: QR_IMAGE_KINDS,
    });
    const picker = backgroundPickerFor({ ...opaque, halo: {} }, QR_IMAGE_KINDS);
    expect(picker.alpha).toBe(false);
    expect(picker.kinds).not.toContain("image");
    expect(picker.kinds).toContain("solid");
  });

  it("draws any picked color, and says which color it drew", () => {
    // The owner's pick: a dark red on white
    const red = { bgColor: "#ffffff", halo: { color: "#881337" } };
    expect(haloRisk(red)).toBeNull();
    expect(haloDrawnAs(red)).toBe(fitHaloColor("#881337", "#ffffff"));
    expect(haloDrawnAs(red)).not.toBe("#881337");
    // A white rim on light grey is drawn darker
    const white = { bgColor: "#e5e7eb", halo: { color: "#ffffff" } };
    expect(haloRisk(white)).toBeNull();
    expect(haloDrawnAs(white)).toBe("#e6e6e6");
    // Drawn as picked: nothing to say
    expect(
      haloDrawnAs({ bgColor: "#ffffff", halo: { color: "#fde68a" } }),
    ).toBeNull();
    // No halo, or none drawn here: nothing drawn instead
    expect(haloDrawnAs({ bgColor: "#ffffff" })).toBeNull();
    expect(haloDrawnAs({ bgColor: "#9ca3af", halo: {} })).toBeNull();
  });

  it("offers tints of the dots' color the halo draws as they are", () => {
    for (const style of [
      { bgColor: "#ffffff", fgColor: "#1d4ed8" },
      { bgColor: "#e5e7eb", fgColor: "#881337" },
      { bgColor: "#ffffff" },
    ]) {
      const tints = haloDotTints(style);
      expect(tints, JSON.stringify(style)).toHaveLength(4);
      for (const color of tints) {
        expect(
          getHaloRisk({ halo: { color }, bgColor: style.bgColor }),
          color,
        ).toBeNull();
      }
    }
    // A gradient's dots: tints of its first color
    expect(
      haloDotTints({
        bgColor: "#ffffff",
        fgColor: {
          type: "linear",
          angle: 0,
          stops: [
            { color: "#1d4ed8", offset: 0 },
            { color: "#db2777", offset: 100 },
          ],
        },
      }),
    ).toEqual(haloDotTints({ bgColor: "#ffffff", fgColor: "#1d4ed8" }));
    expect(haloDotTints({ bgColor: "#9ca3af" })).toEqual([]);
  });

  it("says why for each refusal", () => {
    expect(haloRisk({ bgColor: "#9ca3af" })?.reason).toBe("dark-background");
    const picture = {
      type: "image" as const,
      src: "data:image/png;base64,AA",
      underlay: "#ffffff",
      fit: "cover" as const,
      scale: 1,
      position: "center" as const,
      opacity: 1,
    };
    expect(haloRisk({ bgColor: picture })?.reason).toBe("picture");
  });
});
