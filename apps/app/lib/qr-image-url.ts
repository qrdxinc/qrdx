// The image API's options (/api/v1/qr, the MCP tools): limits, defaults,
// the validated schema, the formats, and the image URL for a set of options.
// Pure (no server imports), so pages that only link to the image API (the
// home page's MCP terminal, /qr-code-api) don't load the renderer
// (lib/qr-render.ts, which re-exports all of this).

import {
  BODY_PATTERN,
  type BodyPattern,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  type CornerEyeDotPattern,
  type CornerEyePattern,
  errorLevelSchema,
  WITHDRAWN_BODY_PATTERNS,
  WITHDRAWN_CORNER_EYE_DOT_PATTERNS,
  WITHDRAWN_CORNER_EYE_PATTERNS,
  withdrawnFallback,
} from "qrdx/types";
import { z } from "zod";
import { baseUrl } from "@/lib/metadata";

export const QR_DATA_MAX_LENGTH = 2048;
export const QR_SIZE_MIN = 64;
export const QR_SIZE_MAX = 2048;
export const QR_MARGIN_MAX = 16;

export const QR_DEFAULTS = {
  size: 512,
  fg: "#000000",
  bg: "#ffffff",
  body: "square",
  eye: "square",
  dot: "square",
  level: "Q",
  margin: 4,
} as const satisfies {
  size: number;
  fg: string;
  bg: string;
  body: BodyPattern;
  eye: CornerEyePattern;
  dot: CornerEyeDotPattern;
  level: z.infer<typeof errorLevelSchema>;
  margin: number;
};

// Both cases spelled out, not /i: JSON Schema patterns (the OpenAPI document)
// carry no flags.
const HEX_COLOR = /^#?(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** A hex colour as the image API takes it (# optional). */
export const hexColor = z
  .string()
  .regex(
    HEX_COLOR,
    "Must be a hex color such as 155dfc (in URLs leave out the # or encode it as %23)",
  );

/**
 * `schema` reading a shape withdrawn before release (qrdx WITHDRAWN_*) as
 * the shape it maps to, so old links and calls still render. The mapping
 * runs first, so `schema` keeps its default in the OpenAPI document.
 */
export function readingWithdrawn<Schema extends z.ZodType>(
  withdrawn: Readonly<Record<string, string>>,
  schema: Schema,
) {
  return z.preprocess((value) => withdrawnFallback(withdrawn, value), schema);
}

/** Render options, validated. Shared by the image API and the MCP tools. */
export const qrOptionsSchema = z.object({
  data: z
    .string()
    .min(1, "Required: the text or URL to encode")
    .max(QR_DATA_MAX_LENGTH, `Must be at most ${QR_DATA_MAX_LENGTH} characters`)
    .describe("Text or URL to encode"),
  size: z
    .number()
    .int()
    .min(QR_SIZE_MIN)
    .max(QR_SIZE_MAX)
    .default(QR_DEFAULTS.size)
    .describe(`Width and height in pixels (${QR_SIZE_MIN}-${QR_SIZE_MAX})`),
  fg: hexColor
    .default(QR_DEFAULTS.fg)
    .describe("Foreground (module) color as hex"),
  bg: hexColor.default(QR_DEFAULTS.bg).describe("Background color as hex"),
  eyeColor: hexColor
    .optional()
    .describe("Color of the three corner eyes (defaults to fg)"),
  dotColor: hexColor
    .optional()
    .describe("Color of the dot inside each corner eye (defaults to fg)"),
  body: readingWithdrawn(
    WITHDRAWN_BODY_PATTERNS,
    z.enum(BODY_PATTERN).default(QR_DEFAULTS.body),
  ).describe("Shape of the data modules"),
  eye: readingWithdrawn(
    WITHDRAWN_CORNER_EYE_PATTERNS,
    z.enum(CORNER_EYE_PATTERNS).default(QR_DEFAULTS.eye),
  ).describe("Shape of the corner eye frames"),
  dot: readingWithdrawn(
    WITHDRAWN_CORNER_EYE_DOT_PATTERNS,
    z.enum(CORNER_EYE_DOT_PATTERNS).default(QR_DEFAULTS.dot),
  ).describe("Shape of the dot inside each corner eye"),
  level: z
    .enum(errorLevelSchema.options)
    .default(QR_DEFAULTS.level)
    .describe("Error correction level: L 7%, M 15%, Q 25%, H 30%"),
  margin: z
    .number()
    .int()
    .min(0)
    .max(QR_MARGIN_MAX)
    .default(QR_DEFAULTS.margin)
    .describe("Quiet zone around the code, in modules"),
});

// Retired eye shapes (curly; diamond, star and banner centres) are not
// offered, but the image API still renders them for existing URLs.
export type QrOptions = Omit<
  z.output<typeof qrOptionsSchema>,
  "eye" | "dot"
> & {
  eye: CornerEyePattern;
  dot: CornerEyeDotPattern;
};

export const qrImageFormats = [
  "svg",
  "png",
  "webp",
  "bmp",
  "ico",
  "gif",
  "tiff",
  "tiff-cmyk",
  "eps",
] as const;
export type QrImageFormat = (typeof qrImageFormats)[number];

/** A hex colour with its #, lower case. */
export function toHex(color: string): string {
  const lower = color.toLowerCase();
  return lower.startsWith("#") ? lower : `#${lower}`;
}

/** Public image API URL for these options; defaults are left out. */
export function buildQrImageUrl(
  options: QrOptions,
  format: QrImageFormat = "svg",
): string {
  const url = new URL("/api/v1/qr", baseUrl);
  url.searchParams.set("data", options.data);
  if (format !== "svg") url.searchParams.set("format", format);

  const entries: [string, string | number | undefined, unknown][] = [
    ["size", options.size, QR_DEFAULTS.size],
    ["fg", toHex(options.fg).slice(1), QR_DEFAULTS.fg.slice(1)],
    ["bg", toHex(options.bg).slice(1), QR_DEFAULTS.bg.slice(1)],
    ["eyeColor", options.eyeColor && toHex(options.eyeColor).slice(1), null],
    ["dotColor", options.dotColor && toHex(options.dotColor).slice(1), null],
    ["body", options.body, QR_DEFAULTS.body],
    ["eye", options.eye, QR_DEFAULTS.eye],
    ["dot", options.dot, QR_DEFAULTS.dot],
    ["level", options.level, QR_DEFAULTS.level],
    ["margin", options.margin, QR_DEFAULTS.margin],
  ];
  for (const [key, value, fallback] of entries) {
    if (value !== undefined && value !== fallback) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}
