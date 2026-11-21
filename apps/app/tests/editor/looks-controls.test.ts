// The Shadow and Rounded corners controls (review findings 2 and 4): the
// shadow's switch stays on through a shift of 0 and keeps the other values,
// its summary says Off while nothing is drawn, and the corner slider's
// limit is the renderer's cap at the level the code is really drawn at.
import { getBgRadiusLimit, QRCodeSVG, resolveQRCodeProps } from "qrdx";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { bgRadiusLimitFor } from "@/components/editor/control-sections/corners-section";
import {
  shadowSummary,
  shadowValues,
} from "@/components/editor/control-sections/shadow-section";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { editorCodeProps } from "@/lib/qr-design/props";
import type { QRStyle } from "@/types/theme";

const VALUE = "https://qrdx.dev/q/Ab3dE9x?utm=campaign";

describe("shadow controls", () => {
  it("keep their values through a shift of 0 and fill the defaults", () => {
    expect(
      shadowValues({ dx: 0, dy: 0, opacity: 0.35, color: "#1d4ed8" }),
    ).toEqual({
      dx: 0,
      dy: 0,
      opacity: 0.35,
      color: "#1d4ed8",
    });
    expect(shadowValues({})).toEqual({
      dx: 0.2,
      dy: 0.2,
      opacity: 0.3,
      color: "#000000",
    });
    expect(shadowValues({ dx: Number.NaN }).dx).toBe(0.2);
  });

  it("summarises what is drawn: Off at a shift of 0", () => {
    expect(shadowSummary(undefined, "Off")).toBe("Off");
    expect(shadowSummary({ dx: 0, dy: 0, opacity: 0.35 }, "Off")).toBe("Off");
    expect(shadowSummary({ dx: 0.1, dy: 0, opacity: 0.35 }, "Off")).toBe("35%");
    expect(shadowSummary({}, "Off")).toBe("30%");
  });
});

describe("corner radius limit", () => {
  it("uses the level the code is drawn at (autoLevel with a logo raises it)", () => {
    const plain = { level: "L" as const, margin: 4 };
    expect(bgRadiusLimitFor(plain, VALUE)).toBeCloseTo(
      getBgRadiusLimit({ value: VALUE, level: "L", margin: 4 }),
    );
    const withLogo = {
      ...plain,
      showLogo: true,
      customLogo: DEFAULT_QR_LOGO,
      autoLevel: true,
      logoOptions: { size: 0.3 },
    };
    const raised = bgRadiusLimitFor(withLogo, VALUE);
    expect(raised).toBeLessThan(bgRadiusLimitFor(plain, VALUE));
    expect(raised).toBeCloseTo(
      getBgRadiusLimit({ value: VALUE, level: "H", margin: 4 }),
    );
  });
});

describe("corner radius limit with an oversized logo", () => {
  /** The corner radius the editor's preview draws, as a share of its width. */
  const drawnRadius = (style: QRStyle, value: string) => {
    const svg = renderToStaticMarkup(
      createElement(
        QRCodeSVG,
        resolveQRCodeProps(editorCodeProps({ ...style, bgRadius: 0.5 }, value)),
      ),
    );
    const rect = /<rect[^>]* height="([\d.]+)" rx="([\d.]+)"/.exec(svg);
    return rect ? Number(rect[2]) / Number(rect[1]) : 0;
  };

  it("matches the radius the renderer draws (the logo capped first)", () => {
    const values = [VALUE, `${VALUE}&${"x".repeat(120)}`, "hi"];
    for (const value of values) {
      for (const level of ["L", "M", "Q"] as const) {
        for (const size of [0.2, 0.3]) {
          const style: QRStyle = {
            level,
            margin: 4,
            showLogo: true,
            customLogo: DEFAULT_QR_LOGO,
            autoLevel: true,
            logoOptions: { size },
          };
          const name = `${value.length} chars, ${level}, logo ${size}`;
          expect(drawnRadius(style, value), name).toBeCloseTo(
            bgRadiusLimitFor(style, value),
            3,
          );
        }
      }
    }
  });
});
