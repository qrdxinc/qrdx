// Pure community rules: handles (opt-in, reserved words and look-alikes),
// text checks, editing a custom frame through its spec in the editor, and
// the theme schema accepting custom frames. No database or network.
import { getOfficialFrame, OFFICIAL_FRAMES } from "qrdx";
import { describe, expect, it } from "vitest";
import {
  customFrameColors,
  customFrameName,
  specIcons,
  specTokens,
  swapSpecIcon,
} from "@/components/editor/control-sections/frame-specs";
import {
  BUILT_IN_SPEC_STYLES,
  builtInSpec,
  officialFrameOfSpec,
} from "@/lib/community/catalog";
import {
  handleProblem,
  looksLikeQrdx,
  normalizeHandle,
  RESERVED_HANDLES,
} from "@/lib/community/handles";
import { textProblem } from "@/lib/community/text";
import {
  loadFrameIndex,
  resetFrameLibraryForTests,
} from "@/lib/frames/library";
import { themeStylePropsSchema } from "@/types/theme";

const wifi = getOfficialFrame("wifi-card");
if (!wifi) throw new Error("no wifi-card");

describe("handles", () => {
  it("normalizes what people type", () => {
    expect(normalizeHandle("  @@Ana_Ruiz ")).toBe("ana_ruiz");
  });

  it("accepts 3 to 30 of a-z, 0-9, _ and -, starting with a letter or digit", () => {
    expect(handleProblem("ana")).toBeNull();
    expect(handleProblem("studio-42_x")).toBeNull();
    expect(handleProblem("ab")).toMatch(/3 to 30/);
    expect(handleProblem("-ana")).toMatch(/3 to 30/);
    expect(handleProblem("ana ruiz")).toMatch(/3 to 30/);
    expect(handleProblem("a".repeat(31))).toMatch(/3 to 30/);
  });

  it("keeps reserved words and qrdx look-alikes for QRdx", () => {
    for (const word of RESERVED_HANDLES) {
      if (word.length >= 3) expect(handleProblem(word)).toMatch(/reserved/);
    }
    for (const alike of ["qr-dx", "qrd_x", "the-qrdx-team", "qrdx0"]) {
      expect(looksLikeQrdx(alike), alike).toBe(true);
      expect(handleProblem(alike)).toMatch(/reserved/);
    }
    expect(looksLikeQrdx("quadrax")).toBe(false);
  });
});

describe("text people publish", () => {
  it("refuses links, emails and phone numbers", () => {
    expect(textProblem("Scan to join Wi-Fi")).toBeNull();
    expect(textProblem("Table 12")).toBeNull();
    expect(textProblem("see https://x.io")).toMatch(/links/);
    expect(textProblem("example.com")).toMatch(/links/);
    expect(textProblem("ana@example.com")).toMatch(/email/);
    expect(textProblem("+44 20 7946 0958")).toMatch(/phone/);
  });
});

describe("editing a custom frame through its spec", () => {
  it("knows the colors and icons a spec uses", () => {
    expect([...specTokens(wifi.spec)].sort()).toEqual(["frame", "text"]);
    expect(specIcons(wifi.spec)).toEqual(["wifi"]);
    expect(
      customFrameColors({ style: "custom", spec: wifi.spec, color: "#123456" }),
    ).toEqual({ frame: "#123456", text: "#ffffff", accent: "#123456" });
  });

  it("swaps an icon and keeps the spec valid", () => {
    const spec = swapSpecIcon(wifi.spec, "wifi", "cup");
    expect(specIcons(spec)).toEqual(["cup"]);
    expect(specIcons(wifi.spec)).toEqual(["wifi"]);
    expect(
      themeStylePropsSchema.safeParse({ frame: { style: "custom", spec } })
        .success,
    ).toBe(true);
    expect(customFrameName({ style: "custom", spec })).toBe("Custom");
  });

  it("names an official frame once the library's index has loaded", async () => {
    resetFrameLibraryForTests();
    // Before: every custom frame is "Custom"
    expect(customFrameName({ style: "custom", spec: wifi.spec })).toBe(
      "Custom",
    );
    await loadFrameIndex();
    expect(customFrameName({ style: "custom", spec: wifi.spec })).toBe(
      "Wi-Fi card",
    );
    // A database may hand the spec back with its keys in another order
    const reordered = Object.fromEntries(
      Object.entries(wifi.spec).reverse(),
    ) as typeof wifi.spec;
    expect(customFrameName({ style: "custom", spec: reordered })).toBe(
      "Wi-Fi card",
    );
  });

  it("names every official frame and opens the built-in specs", () => {
    for (const frame of OFFICIAL_FRAMES) {
      expect(officialFrameOfSpec(frame.spec)?.id).toBe(frame.id);
    }
    expect(BUILT_IN_SPEC_STYLES.length).toBeGreaterThan(0);
    for (const style of BUILT_IN_SPEC_STYLES) {
      expect(builtInSpec(style)?.kind).toBe("qrdx.frame");
    }
  });

  it("lets saved themes and codes carry a custom frame, but only a valid one", () => {
    expect(
      themeStylePropsSchema.safeParse({
        frame: { style: "custom", spec: wifi.spec, text: "Join us" },
      }).success,
    ).toBe(true);
    expect(
      themeStylePropsSchema.safeParse({
        frame: {
          style: "custom",
          spec: { ...wifi.spec, qr: { ...wifi.spec.qr, size: 10 } },
        },
      }).success,
    ).toBe(false);
    expect(
      themeStylePropsSchema.safeParse({ frame: { style: "banner-bottom" } })
        .success,
    ).toBe(true);
  });
});
