import {
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  FRAME_STYLES,
  FRAME_TEXT_MAX_LENGTH,
  RETIRED_CORNER_EYE_DOT_PATTERNS,
  RETIRED_CORNER_EYE_PATTERNS,
  WITHDRAWN_CORNER_EYE_DOT_PATTERNS,
  WITHDRAWN_CORNER_EYE_PATTERNS,
} from "qrdx/types";
import { z } from "zod";
import {
  FILE_ID,
  isOfficialFrameName,
  OFFICIAL_FRAME_ID,
  OFFICIAL_FRAME_ID_MAX_LENGTH,
} from "@/lib/qr-api/style";
import { logoIconSchema } from "@/lib/qr-design/logo-icon";
import {
  QR_DEFAULTS,
  QR_MARGIN_MAX,
  QR_SIZE_MAX,
  QR_SIZE_MIN,
  qrImageFormats,
  qrOptionsSchema,
  readingWithdrawn,
} from "@/lib/qr-render";

// Query schema of GET /v1/qr, here rather than in the route file so the
// OpenAPI generator (lib/openapi) documents exactly what it validates.

/** Longest `style` value, in characters. */
export const STYLE_QUERY_MAX_LENGTH = 8192;

/**
 * Built-in frames a URL can name. Official frames go by id; other custom
 * frames go in `style`.
 */
const URL_FRAME_STYLES = FRAME_STYLES.filter(
  (style) => style !== "none",
) as unknown as [string, ...string[]];

/**
 * The parameters that turn on the styled renderer (lib/qr-api/render.ts).
 * Requests with none of them keep the original renderer, byte for byte.
 */
export const STYLED_PARAMS = [
  "style",
  "item",
  "frame",
  "frameText",
  "logoIcon",
  "logoFileId",
] as const;

/** GET /v1/qr query (the route also lower/upper-cases a few enums first). */
export const qrImageQuerySchema = qrOptionsSchema.extend({
  // Retired shapes are no longer listed, but existing image URLs that use
  // them keep rendering exactly as before.
  eye: readingWithdrawn(
    WITHDRAWN_CORNER_EYE_PATTERNS,
    z
      .enum([...CORNER_EYE_PATTERNS, ...RETIRED_CORNER_EYE_PATTERNS])
      .default(QR_DEFAULTS.eye),
  ),
  dot: readingWithdrawn(
    WITHDRAWN_CORNER_EYE_DOT_PATTERNS,
    z
      .enum([...CORNER_EYE_DOT_PATTERNS, ...RETIRED_CORNER_EYE_DOT_PATTERNS])
      .default(QR_DEFAULTS.dot),
  ),
  format: z.enum(qrImageFormats).default("svg"),
  size: z.coerce
    .number()
    .int()
    .min(QR_SIZE_MIN)
    .max(QR_SIZE_MAX)
    .default(QR_DEFAULTS.size),
  margin: z.coerce
    .number()
    .int()
    .min(0)
    .max(QR_MARGIN_MAX)
    .default(QR_DEFAULTS.margin),
  style: z
    .string()
    .max(STYLE_QUERY_MAX_LENGTH)
    .optional()
    .describe(
      'The editor\'s whole style: URL-encoded JSON with the same fields as a saved theme (gradients, frames (built-in, custom frame specs, or an official frame by id as { "style": "autumn-maple", "text": "Hello" }), eye and dot colors, logoIcon, logoFileId), or the `style` value of a playground link (1.…). Flat parameters you also set win over it.',
    ),
  item: z
    .string()
    .max(100)
    .optional()
    .describe(
      "A community theme or frame by id, such as frame:wifi-table-card (from /v1/community/items). `style` and flat parameters win over it.",
    ),
  frame: z
    .union([
      z.enum(URL_FRAME_STYLES),
      z
        .string()
        .max(OFFICIAL_FRAME_ID_MAX_LENGTH)
        .regex(OFFICIAL_FRAME_ID, "Must be a built-in frame or a frame id")
        // "none" and "custom" are frame styles, never ids
        .refine(isOfficialFrameName, "Must be a built-in frame or a frame id"),
    ])
    .optional()
    .describe(
      "A call-to-action frame around the code: a built-in frame, or one of QRdx's official frames by id, such as autumn-maple",
    ),
  frameText: z
    .string()
    .max(FRAME_TEXT_MAX_LENGTH)
    .optional()
    .describe(
      `The frame's label, up to ${FRAME_TEXT_MAX_LENGTH} characters (default "Scan me"; empty hides it)`,
    ),
  logoIcon: logoIconSchema.optional(),
  logoFileId: z
    .string()
    .regex(FILE_ID, "Must be an uploaded file id")
    .optional()
    .describe(
      "A logo you uploaded (PNG or JPEG, up to 1 MB) by file id. Needs `Authorization: Bearer qrdx_…` from the workspace that owns the file; the response is then private and not cached.",
    ),
});
