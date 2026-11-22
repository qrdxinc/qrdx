// styleEngineOptions: the engine options a saved style carries, ready for
// getQRData and <QRCode>. Unset or default values stay out, so styles saved
// before these options existed render exactly as they did.
import { describe, expect, it } from "vitest";
import {
  payloadEngineOptions,
  styleEngineOptions,
  styleSvgOptions,
} from "@/lib/qr-design/engine-options";
import { SWISS_CROSS_LOGO, swissCrossShare } from "@/utils/swiss-qr-bill";
import { SIX_SAMPLES } from "../support/swiss-qr-bill-samples";

const URL = "https://qrdx.dev";

describe("styleEngineOptions", () => {
  it("is empty for a style without engine options", () => {
    expect(
      styleEngineOptions({ bgColor: "#fff", bodyPattern: "square" }, URL),
    ).toEqual({});
  });

  it("drops defaults and empty values", () => {
    expect(
      styleEngineOptions(
        {
          moduleScale: 1,
          autoLevel: false,
          logoOptions: {},
          eyeColors: { topLeft: {} },
        },
        URL,
      ),
    ).toEqual({});
  });

  it("returns every set option", () => {
    const style = {
      moduleScale: 0.8,
      autoLevel: true,
      logoOptions: { size: 0.2, x: 0.3 },
      eyeColors: { topRight: { outer: "#b91c1c" } },
    };
    expect(styleEngineOptions(style, URL)).toEqual(style);
  });

  it("carries the circle shape, and nothing for a square one", () => {
    expect(styleEngineOptions({ shape: "circle" }, URL)).toEqual({
      shape: "circle",
    });
    expect(styleEngineOptions({ shape: "square" }, URL)).toEqual({});
    expect(styleSvgOptions({ shape: "circle" }, URL)).toEqual({
      shape: "circle",
    });
  });

  it("carries the looks around the shapes, each only when it draws", () => {
    const looks = {
      eyeShapes: { topLeft: { outer: "leaf" as const } },
      eyeGradient: "code" as const,
      bgRadius: 0.2,
      backdrop: "#0f172a",
      halo: { width: 0.3 },
      shadow: { dx: 0.1, dy: 0.1 },
    };
    expect(styleEngineOptions(looks, URL)).toEqual(looks);
    expect(styleSvgOptions(looks, URL)).toEqual(looks);
    expect(
      styleEngineOptions(
        {
          eyeShapes: { topLeft: {} },
          eyeGradient: "corner",
          bgRadius: 0,
          backdrop: "#0f172a",
          shadow: { dx: 0, dy: 0 },
        },
        URL,
      ),
    ).toEqual({});
    // A backdrop only with a rounded corner to show outside
    expect(styleEngineOptions({ backdrop: "#0f172a" }, URL)).toEqual({});
  });

  it("gives <QRCodeSVG> only the props it takes", () => {
    expect(
      styleSvgOptions(
        {
          moduleScale: 0.8,
          autoLevel: true,
          logoOptions: { size: 0.2 },
          eyeColors: { topRight: { outer: "#b91c1c" } },
        },
        URL,
      ),
    ).toEqual({
      moduleScale: 0.8,
      eyeColors: { topRight: { outer: "#b91c1c" } },
    });
  });
});

describe("what the payload asks for", () => {
  // SIX's sample 1 as published (CRLF) and as QRdx writes it (LF)
  const BILL_CRLF = SIX_SAMPLES.nr1;
  const BILL = BILL_CRLF.replace(/\r\n/g, "\n");

  it("encodes a Swiss QR-bill at exactly its level, and nothing else", () => {
    expect(payloadEngineOptions(BILL)).toEqual({ exactLevel: true });
    expect(payloadEngineOptions(BILL_CRLF)).toEqual({ exactLevel: true });
    expect(payloadEngineOptions(URL)).toEqual({});
    expect(payloadEngineOptions("SPC")).toEqual({});
    expect(payloadEngineOptions("SPC\nhello")).toEqual({});
    expect(styleEngineOptions({}, BILL)).toEqual({ exactLevel: true });
    expect(styleSvgOptions({ shape: "circle" }, BILL)).toEqual({
      shape: "circle",
      exactLevel: true,
    });
  });

  it("keeps the Swiss cross 7/46 of the symbol at the margin drawn", () => {
    const style = {
      showLogo: true,
      customLogo: SWISS_CROSS_LOGO,
      logoOptions: { size: swissCrossShare(BILL, 0) },
    };
    expect(styleEngineOptions(style, BILL).logoOptions).toEqual({
      size: swissCrossShare(BILL, 0),
    });
    // The generator pages' 4-module quiet zone makes it a smaller share
    const quiet = styleEngineOptions(style, BILL, 4).logoOptions?.size ?? 0;
    expect(quiet).toBe(swissCrossShare(BILL, 4));
    expect(quiet).toBeLessThan(swissCrossShare(BILL, 0));
    // Another logo, or the cross on other content, is left as it is
    expect(
      styleEngineOptions({ ...style, customLogo: "data:," }, BILL, 4)
        .logoOptions,
    ).toEqual(style.logoOptions);
    expect(styleEngineOptions(style, URL, 4).logoOptions).toEqual(
      style.logoOptions,
    );
  });
});
