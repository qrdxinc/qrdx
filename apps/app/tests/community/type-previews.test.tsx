// The pictures that say what an item is: a frame around an empty slot (no
// code drawn), placed where the engine puts the code, and a theme's swatch,
// a crop of its code that holds one whole eye and stops short of the next.

import { getFrameLayout, getOfficialFrame, QRCode } from "qrdx";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  FrameSlot,
  SWATCH_CODE,
  SWATCH_VIEW_BOX,
  SwatchCrop,
} from "@/components/community/type-previews";
import { officialFramePreview } from "@/lib/community/catalog";

const TABLE_TENT = getOfficialFrame("table-tent");
if (!TABLE_TENT) throw new Error("table-tent is missing");
const FRAME_STYLE = officialFramePreview(TABLE_TENT);

/** The opening tag of the first element whose tag matches `pattern`. */
const tagWith = (html: string, pattern: RegExp) =>
  html.match(new RegExp(`<svg[^>]*${pattern.source}[^>]*>`))?.[0] ?? "";

describe("FrameSlot", () => {
  it("draws the frame with a holder in the code's place and no code", () => {
    const html = renderToStaticMarkup(
      <FrameSlot label="Your QR code" style={FRAME_STYLE} />,
    );
    const frame = FRAME_STYLE.frame;
    if (!frame) throw new Error("no frame");
    const layout = getFrameLayout(128, frame, FRAME_STYLE.bgColor);
    const slot = tagWith(html, /viewBox="0 0 100 100"/);
    expect(slot).toContain(`x="${Math.round(layout.qrX * 100) / 100}"`);
    expect(slot).toContain(`y="${Math.round(layout.qrY * 100) / 100}"`);
    expect(slot).toContain('width="128"');
    expect(html).toContain(">Your QR code</text>");
    expect(html).toContain('data-qrdx-frame="custom"');
    // The code would be a 128 × 128 <svg>: there is none
    expect(html).not.toContain('viewBox="0 0 128 128"');
  });

  it("draws nothing for a style without a frame", () => {
    expect(
      renderToStaticMarkup(<FrameSlot label="Your QR code" style={{}} />),
    ).toBe("");
  });
});

describe("SwatchCrop", () => {
  it("is cut from a 25-module code: one whole eye, short of the next", () => {
    const html = renderToStaticMarkup(
      <QRCode
        cornerEyePattern="square"
        hideLogo
        level={SWATCH_CODE.level}
        margin={SWATCH_CODE.margin}
        partMarkers
        size={SWATCH_CODE.size}
        value={SWATCH_CODE.value}
      />,
    );
    const eyeStart = (eye: string) =>
      html.match(
        new RegExp(`data-qrdx-eye="${eye}"><path d="M ([\\d.]+) ([\\d.]+)`),
      );
    const [, , width, height] = SWATCH_VIEW_BOX.split(" ").map(Number);
    const topLeft = eyeStart("top-left");
    const topRight = eyeStart("top-right");
    // 10 units a module: the eye spans 10–80, the next eye starts at 190
    expect(topLeft?.slice(1)).toEqual(["10", "10"]);
    expect(topRight?.slice(1)).toEqual(["190", "10"]);
    expect(80).toBeLessThan(height as number);
    expect(190).toBeGreaterThan(width as number);
  });

  it("shows that part of the theme's code, filling its box", () => {
    const html = renderToStaticMarkup(
      <SwatchCrop
        style={{
          fgColor: "#1d4ed8",
          bgColor: "#eff6ff",
          frame: { style: "banner-bottom", text: "Scan me" },
          templateId: "default",
        }}
      />,
    );
    const root = html.match(/<svg[^>]*>/)?.[0] ?? "";
    expect(root).toContain(`viewBox="${SWATCH_VIEW_BOX}"`);
    expect(root).toContain('preserveAspectRatio="xMinYMin slice"');
    // In its own colors, without the frame or template around it
    expect(html).toContain("#1d4ed8");
    expect(html).toContain("#eff6ff");
    expect(html).not.toContain("data-qrdx-frame");
    expect(html).not.toContain("svgQrWrapper");
  });
});
