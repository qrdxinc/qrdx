/**
 * Generates mini QR code preview images (PNG) for each pattern and frame option.
 * Results are cached to environment.supportPath so sips only runs on first load.
 */

import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { environment } from "@raycast/api";
import type {
  BodyPattern,
  CornerEyeDotPattern,
  CornerEyePattern,
  QRFrame,
} from "qrdx";
import { DEFAULT_FRAME_TEXT, getFrameDimensions, QRCodeSVG } from "qrdx";
import { version as QRDX_VERSION } from "qrdx/package.json";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FRAME_CHOICES } from "./frames";
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

function getCacheDir(): string {
  // One folder per qrdx version and preview size, so an update redraws every
  // preview. The folders of earlier versions and sizes are removed.
  const root = join(environment.supportPath, "previews");
  const name = `${QRDX_VERSION}-${PREVIEW_SIZE}px`;
  const dir = join(root, name);
  if (!existsSync(dir)) {
    if (existsSync(root)) {
      for (const old of readdirSync(root)) {
        if (old !== name) {
          rmSync(join(root, old), { recursive: true, force: true });
        }
      }
    }
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Returns the absolute path to a cached PNG for the given key + overrides. */
function previewPNG(key: string, overrides: Record<string, unknown>): string {
  const cacheDir = getCacheDir();
  const pngPath = join(cacheDir, `${key}.png`);

  if (!existsSync(pngPath)) {
    const svgPath = join(cacheDir, `${key}.svg`);
    const svgString = renderSVGString(overrides);
    writeFileSync(
      svgPath,
      `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`,
      "utf-8"
    );
    execSync(
      `sips -s format png "${svgPath}" --out "${pngPath}" --resampleHeightWidth ${PREVIEW_SIZE} ${PREVIEW_SIZE} 2>/dev/null`,
      { stdio: "pipe" }
    );
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
