// The Halo section and the preview's dots toolbar share HaloControl
// (control-sections/halo-section.tsx). Any color picked is drawn: where the
// engine moves it to keep the code readable, the control shows the color
// drawn next to the picked one, and it offers tints of the dots' color
// that are drawn as they are. Only a background that takes no halo says
// it won't scan here (the owner's report, 22 Nov 2026: a dark red on white
// was refused and the color control looked dead).
import { fitHaloColor } from "qrdx";
import { describe, expect, it, vi } from "vitest";
import {
  HaloControl,
  haloSummary,
} from "@/components/editor/control-sections/halo-section";
import { defaultThemeState } from "@/config/qr";
import type { QRStyle } from "@/types/theme";
import { renderIntl } from "../support/intl";

// The color control's focus store reads the panel's tab from the URL
vi.mock("@/lib/hooks/use-controls-tab-from-url", () => ({
  useControlsTabFromUrl: () => ({
    tab: "customisations",
    handleSetTab: () => undefined,
    aiAvailable: false,
  }),
}));

const style = (extra: Partial<QRStyle>): QRStyle => ({
  ...defaultThemeState.styles,
  ...extra,
});

const render = (extra: Partial<QRStyle>) =>
  renderIntl(<HaloControl onChange={() => undefined} style={style(extra)} />);

const swatches = (html: string) =>
  [...html.matchAll(/<button[^>]*aria-pressed="(?:true|false)"[^>]*>/g)].length;

describe("the halo's color control", () => {
  it("draws a dark red on white as a tint, and says so", () => {
    const html = render({
      bgColor: "#ffffff",
      fgColor: "#000000",
      halo: { color: "#881337" },
    });
    const drawn = fitHaloColor("#881337", "#ffffff") as string;
    expect(html).toContain(
      `Drawn as ${drawn.toUpperCase()} so the code still scans`,
    );
    expect(html).toContain(`data-halo-drawn="${drawn}"`);
    expect(html).not.toContain("Won&#x27;t scan here");
    expect(html).toContain("Tints of your dots");
    expect(swatches(html)).toBe(4);
  });

  it("says nothing more for a color drawn as picked", () => {
    const html = render({ bgColor: "#ffffff", halo: { color: "#fde68a" } });
    expect(html).not.toContain("Drawn as");
    expect(html).not.toContain("Won&#x27;t scan here");
    expect(swatches(html)).toBe(4);
  });

  it("says why where no halo can be drawn, in plain words", () => {
    const dark = render({ bgColor: "#9ca3af", halo: {} });
    expect(dark).toContain("Won&#x27;t scan here");
    expect(dark).toContain(
      "A halo needs a light background, at least light grey.",
    );
    expect(dark).not.toContain("Drawn as");
    expect(swatches(dark)).toBe(0);
    const seeThrough = render({ bgColor: "#ffffff00", halo: {} });
    expect(seeThrough).toContain("A halo needs an opaque background.");
  });

  it("summarises a moved color by its width, not as a risk", () => {
    const copy = { off: "Off", wontScanHere: "Won't scan here" };
    expect(
      haloSummary(
        style({ bgColor: "#ffffff", halo: { color: "#881337", width: 0.3 } }),
        copy,
      ),
    ).toBe("30%");
    expect(haloSummary(style({ bgColor: "#9ca3af", halo: {} }), copy)).toBe(
      "Won't scan here",
    );
  });
});
