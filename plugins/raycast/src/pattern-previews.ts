/**
 * Generates mini QR code preview images (PNG) for each pattern and frame option.
 * Results are cached to environment.supportPath so sips only runs on first load.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  BodyPattern,
  CornerEyeDotPattern,
  CornerEyePattern,
  QRFrame,
} from "qrdx";
import { DEFAULT_FRAME_TEXT, getFrameDimensions, QRCodeSVG } from "qrdx";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FRAME_CHOICES } from "./frames";
import { cacheDir, drawPNGSync } from "./preview-files";
import { squareSVG } from "./qr-engine";
import {
  BODY_PATTERNS,
  CORNER_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  isCornerDotPattern,
} from "./types";

const PREVIEW_VALUE = "https://qrdx.dev";
// The pickers show three tiles a row, each about 470 px wide on a Retina
// screen, so previews are drawn at 512 px to stay sharp. sips takes as long
// at 512 px as at 64.
const PREVIEW_SIZE = 512;

function renderSVGString(overrides: Record<string, unknown>): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const el = createElement(QRCodeSVG as any, {
    value: PREVIEW_VALUE,
    size: PREVIEW_SIZE,
    fgColor: "#000000",
    bgColor: "#ffffff",
    margin: 1,
    ...overrides,
  });
  const svg = renderToStaticMarkup(el);
  const frame = overrides.frame as QRFrame | undefined;
  if (!frame) return svg;
  // A frame adds space around the code, so the artwork is larger than the
  // tile and seldom square: fit it, centered, on a white square.
  return squareSVG(
    svg,
    getFrameDimensions(PREVIEW_SIZE, frame),
    PREVIEW_SIZE,
    "#ffffff"
  );
}

/** Returns the absolute path to a cached PNG for the given key + overrides. */
function previewPNG(key: string, overrides: Record<string, unknown>): string {
  // One folder per qrdx version and preview size, so an update redraws every
  // preview. The folders of earlier versions and sizes are removed.
  const pngPath = join(cacheDir("previews", PREVIEW_SIZE), `${key}.png`);
  if (!existsSync(pngPath)) {
    drawPNGSync(renderSVGString(overrides), pngPath, PREVIEW_SIZE);
  }
  return pngPath;
}

// ─── Body patterns ────────────────────────────────────────────────────────────

export const bodyPatternPreviews: Record<BodyPattern, string> = (() => {
  const map = {} as Record<BodyPattern, string>;
  for (const p of BODY_PATTERNS) {
    map[p] = previewPNG(`body-${p}`, { bodyPattern: p });
  }
  return map;
})();

// ─── Corner eye patterns ──────────────────────────────────────────────────────

export const cornerEyePatternPreviews: Record<CornerEyePattern, string> =
  (() => {
    const map = {} as Record<CornerEyePattern, string>;
    for (const p of CORNER_EYE_PATTERNS) {
      // The frame with its namesake centre where qrdx has one (circle,
      // leaf, …), and a round centre otherwise.
      map[p] = previewPNG(`eye-${p}`, {
        cornerEyePattern: p,
        cornerEyeDotPattern: isCornerDotPattern(p) ? p : "circle",
      });
    }
    return map;
  })();

// ─── Corner dot patterns ──────────────────────────────────────────────────────

export const cornerDotPatternPreviews: Record<CornerEyeDotPattern, string> =
  (() => {
    const map = {} as Record<CornerEyeDotPattern, string>;
    for (const p of CORNER_DOT_PATTERNS) {
      map[p] = previewPNG(`dot-${p}`, { cornerEyeDotPattern: p });
    }
    return map;
  })();

// ─── Frames ───────────────────────────────────────────────────────────────────

// Each frame with qrdx's default label and colors; no frame is the plain code.
export const framePreviews: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const style of FRAME_CHOICES) {
    map[style] = previewPNG(
      `frame-${style || "none"}`,
      style ? { frame: { style, text: DEFAULT_FRAME_TEXT } } : {}
    );
  }
  return map;
})();
