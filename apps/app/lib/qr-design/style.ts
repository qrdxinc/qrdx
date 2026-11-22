// How a QR code looks, as the AI chat and the MCP `design_qr` tool describe
// it: every style option the engine renders, limited to values it accepts.
// The same schema is Gemini's structured output (lib/ai/agent) and the MCP
// input, and `toThemeStyles` turns it into the editor's ThemeStyles.
//
// Not here, on purpose: uploaded logos and Logo QR / Image QR art (they need
// an image the user supplies) and retired shapes (curly eyes; diamond, star
// and banner centers), which don't scan reliably. A custom frame of the
// user's own is described as "keep": the chat can keep it, never draw a new
// one. A silhouette traced from an upload never reaches a model
// (lib/paint/image-fills.ts), so a design draws square, circle or heart.
//
// Safe to import anywhere: official frames are looked up through
// StyleSources, so the frame catalogue stays on the server.
import { getTemplateIds } from "qrdx";
import {
  type AnyQRFrame,
  BG_RADIUS_MAX,
  BODY_PATTERN,
  bodyPatternSchema,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  type ColorConfig,
  DEFAULT_FRAME_TEXT,
  EYE_GRADIENT_SPANS,
  EYE_POSITIONS,
  type EyePosition,
  FRAME_STYLES,
  FRAME_TEXT_MAX_LENGTH,
  type FrameSpec,
  getSolidColor,
  HALO_WIDTH_MAX,
  HALO_WIDTH_MIN,
  isGradient,
  LOGO_PADDING_MAX,
  LOGO_SHAPES,
  LOGO_SIZE_MAX,
  LOGO_SIZE_MIN,
  MODULE_SCALE_MAX,
  MODULE_SCALE_MIN,
  pickableCornerEyeDotPatternSchema,
  pickableCornerEyePatternSchema,
  type QRCustomFrame,
  SHADOW_OFFSET_MAX,
  SHADOW_OPACITY_MAX,
  SHADOW_OPACITY_MIN,
} from "qrdx/types";
import { z } from "zod";
import type { ThemeStyles } from "@/types/theme";

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Quick logo icons the editor offers (components/editor/control-sections/logo-presets.tsx). */
export const LOGO_ICON_IDS = [
  "wifi",
  "location",
  "phone",
  "email",
  "link",
  "file",
  "calendar",
  "whatsapp",
  "instagram",
] as const;
export type LogoIconId = (typeof LOGO_ICON_IDS)[number];

/**
 * A logoIcon: a quick icon id, or a Simple Icons brand slug with an optional
 * color (`<slug>` / `<slug>:<brand|black|white>`). Whether a slug exists is
 * checked where the mark is drawn (./logo.ts), on the server.
 */
export const LOGO_ICON_PATTERN = /^[a-z0-9]{1,64}(?::(?:brand|black|white))?$/;

/**
 * "none": no logo. "keep": whatever logo the code shows now (an uploaded one
 * stays). "qrdx": the QRdx mark. The rest are the editor's quick icons.
 */
export const LOGO_CHOICES = ["none", "keep", "qrdx", ...LOGO_ICON_IDS] as const;
/** A LOGO_CHOICES value or a brand logo (LOGO_ICON_PATTERN). */
export type LogoChoice = (typeof LOGO_CHOICES)[number] | (string & {});

export const isLogoChoice = (
  value: unknown,
): value is (typeof LOGO_CHOICES)[number] =>
  typeof value === "string" &&
  (LOGO_CHOICES as readonly string[]).includes(value);

/** Engine border templates; "default" is no border. */
export const TEMPLATE_IDS = getTemplateIds() as [string, ...string[]];

export const ERROR_LEVELS = ["L", "M", "Q", "H"] as const;

export const MARGIN_MAX = 16;

/**
 * Frames a design names: the built-in ones (FRAME_STYLES, "none" among
 * them), "official" (QRdx's official frames, by `id`) and "keep" (the code's
 * own custom frame, which can't be described here).
 */
export const DESIGN_FRAME_STYLES = [
  ...FRAME_STYLES,
  "official",
  "keep",
] as const;

/** Outlines a design names. */
export const DESIGN_SHAPES = ["square", "circle", "heart"] as const;

/** The options beyond colors, shapes and the frame, each optional. */
export const LOOK_KEYS = [
  "eyeColors",
  "eyeShapes",
  "eyeGradient",
  "moduleScale",
  "shape",
  "bgRadius",
  "backdrop",
  "halo",
  "shadow",
  "logoOptions",
  "autoLevel",
] as const;
export type LookKey = (typeof LOOK_KEYS)[number];

type Hex = (description: string) => z.ZodString;
type Num = (min: number, max: number, description: string) => z.ZodNumber;

interface Builders {
  hex: Hex;
  label: (description: string) => z.ZodString;
  num: Num;
}

/** A two-color gradient on one part of the code. */
type GradientInput = {
  type: "linear" | "radial";
  from: string;
  to: string;
  angle?: number;
};

const strict: Builders = {
  hex: (description) =>
    z.string().regex(HEX_COLOR).describe(`${description}, #RRGGBB`),
  label: (description) =>
    z.string().max(FRAME_TEXT_MAX_LENGTH).describe(description),
  num: (min, max, description) =>
    z.number().min(min).max(max).describe(description),
};

/*
 * Models don't reliably keep to regex patterns or length limits in
 * structured output (Gemini once wrote an explanation inside a color). The
 * designer gets plain strings and numbers, and sanitizeDesignStyle makes its
 * answer valid before the strict schema checks it. Its look numbers are
 * whole percents (a dot size of 90, an opacity of 25): asked for a fraction,
 * Gemini repeated digits until it ran out of tokens (0.2522564478…).
 */
const loose: Builders = {
  hex: (description) => z.string().describe(`${description}, exactly #RRGGBB`),
  label: (description) => z.string().describe(description),
  num: (min, max, description) =>
    z
      .number()
      .int()
      .describe(
        `${description}, a whole number of percent (${Math.round(min * 100)} to ${Math.round(max * 100)})`,
      ),
};

/** The look numbers, by look: the designer writes them as whole percents. */
const PERCENT_FIELDS: Partial<Record<LookKey, true | readonly string[]>> = {
  moduleScale: true,
  bgRadius: true,
  halo: ["width"],
  shadow: ["opacity", "dx", "dy"],
  logoOptions: ["size", "padding", "x", "y"],
};

/** One look with its numbers scaled by `factor` (unchanged when not numbers). */
function scaleLook(key: LookKey, value: unknown, factor: number): unknown {
  const fields = PERCENT_FIELDS[key];
  if (!fields) return value;
  if (fields === true) {
    return typeof value === "number" ? value * factor : value;
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([field, item]) => [
      field,
      fields.includes(field) && typeof item === "number" ? item * factor : item,
    ]),
  );
}

/**
 * A style as the designer reads it: its look numbers in whole percents, the
 * units it answers in (sanitizeDesignStyle turns them back).
 */
export function toDesignerView(
  style: Partial<DesignStyle>,
): Record<string, unknown> {
  const view: Record<string, unknown> = { ...style };
  // Per-eye looks in the designer's flat fields
  for (const field of FLAT_EYE_FIELDS) {
    const eyes = style[field.look] as
      | PerEye<Record<string, string>>
      | undefined;
    const value = eyes?.[field.position]?.[field.part];
    if (value !== undefined) view[field.key] = value;
  }
  delete view.eyeColors;
  delete view.eyeShapes;
  for (const key of LOOK_KEYS) {
    if (view[key] === undefined) continue;
    const scaled = scaleLook(key, view[key], 100);
    view[key] =
      typeof scaled === "number"
        ? Math.round(scaled)
        : scaled && typeof scaled === "object"
          ? Object.fromEntries(
              Object.entries(scaled).map(([field, item]) => [
                field,
                typeof item === "number" ? Math.round(item) : item,
              ]),
            )
          : scaled;
  }
  return view;
}

const gradientSchemaOf = ({ hex }: Builders) =>
  z
    .object({
      type: z.enum(["linear", "radial"]),
      from: hex("Start color"),
      to: hex("End color"),
      angle: z
        .number()
        .int()
        .min(0)
        .max(360)
        .optional()
        .describe("Linear gradients only: 0 left to right, 90 top to bottom"),
    })
    .describe("A two-color gradient that replaces the solid color");

const builtInFrameSchemaOf = ({ hex, label }: Builders) =>
  z.object({
    style: z
      .enum(FRAME_STYLES)
      .describe("Call-to-action frame around the code; none for no frame"),
    text: label(
      `Frame label, at most ${FRAME_TEXT_MAX_LENGTH} characters (default "${DEFAULT_FRAME_TEXT}")`,
    ).optional(),
    secondaryText: label(
      "Second label: bottom band of banner-top-bottom, lower arc of circle, menu-card footer",
    ).optional(),
    color: hex("Frame color").optional(),
    textColor: hex("Frame label color").optional(),
  });

const frameSchemaOf = (builders: Builders) =>
  builtInFrameSchemaOf(builders).extend({
    style: z
      .enum(DESIGN_FRAME_STYLES)
      .describe(
        "Frame around the code: a built-in call-to-action frame, official (one of QRdx's official frames, by id), keep (the code's own frame, only when the current style says keep) or none",
      ),
    id: z
      .string()
      .max(80)
      .optional()
      .describe("official only: the official frame's id"),
    text: builders
      .label(
        `Frame label, at most ${FRAME_TEXT_MAX_LENGTH} characters (built-in frames default to "${DEFAULT_FRAME_TEXT}"; official and kept frames keep their own)`,
      )
      .optional(),
    secondaryText: builders
      .label(
        "Second label: bottom band of banner-top-bottom, lower arc of circle, menu-card footer, or an official frame's second label",
      )
      .optional(),
  });

const eyeOf = <T extends z.ZodType>(make: (part: "outer" | "inner") => T) =>
  z.object({
    outer: make("outer").optional(),
    inner: make("inner").optional(),
  });

const perEyeOf = <T extends z.ZodType>(eye: T) =>
  z.object({
    topLeft: eye.optional(),
    topRight: eye.optional(),
    bottomLeft: eye.optional(),
  });

/** The looks: options beyond colors, shapes and the frame (LOOK_KEYS). */
const lookFieldsOf = ({ hex, num }: Builders) => ({
  eyeColors: perEyeOf(
    eyeOf((part) =>
      hex(
        part === "outer" ? "This eye's frame color" : "This eye's center color",
      ),
    ),
  ).describe(
    "Per-eye colors (topLeft, topRight, bottomLeft), each { outer, inner }: they override eyeColor and dotColor for that eye and need the same contrast",
  ),
  eyeShapes: perEyeOf(
    z.object({
      outer: pickableCornerEyePatternSchema
        .optional()
        .describe("This eye's frame shape"),
      inner: pickableCornerEyeDotPatternSchema
        .optional()
        .describe("This eye's center shape"),
    }),
  ).describe(
    "Per-eye shapes (topLeft, topRight, bottomLeft), each { outer, inner }: they override cornerEyePattern and cornerEyeDotPattern for that eye",
  ),
  eyeGradient: z
    .enum(EYE_GRADIENT_SPANS)
    .describe(
      "Where the eyes' gradients run: corner (each eye on its own) or code (across the whole code, so the eyes continue the dots' gradient)",
    ),
  moduleScale: num(
    MODULE_SCALE_MIN,
    MODULE_SCALE_MAX,
    "Size of each dot (1 is full size; smaller dots leave gaps and scan less well)",
  ),
  shape: z
    .enum(DESIGN_SHAPES)
    .describe(
      "Outline of the code: square, circle or heart (decorative dots fill the disc or heart around it)",
    ),
  bgRadius: num(
    0,
    BG_RADIUS_MAX,
    "Rounded background corners, as a share of the code's width (needs a margin of 2 or more)",
  ),
  backdrop: hex("Color outside the rounded background corners"),
  halo: z
    .object({
      color: hex("Rim color, light").optional(),
      width: num(
        HALO_WIDTH_MIN,
        HALO_WIDTH_MAX,
        "Rim width in modules",
      ).optional(),
    })
    .describe(
      "A light rim around the dark dots and eyes, drawn only on an opaque light background",
    ),
  shadow: z
    .object({
      color: hex("Shadow color").optional(),
      opacity: num(
        SHADOW_OPACITY_MIN,
        SHADOW_OPACITY_MAX,
        "Opacity",
      ).optional(),
      dx: num(
        -SHADOW_OFFSET_MAX,
        SHADOW_OFFSET_MAX,
        "Offset to the right, in modules",
      ).optional(),
      dy: num(
        -SHADOW_OFFSET_MAX,
        SHADOW_OFFSET_MAX,
        "Offset down, in modules",
      ).optional(),
    })
    .describe("A see-through copy of the dark dots and eyes under them"),
  logoOptions: z
    .object({
      size: num(
        LOGO_SIZE_MIN,
        LOGO_SIZE_MAX,
        "Share of the code's width",
      ).optional(),
      padding: num(
        0,
        LOGO_PADDING_MAX,
        "Clear space around it, in modules",
      ).optional(),
      x: num(0, 1, "Center across the code (0.5 is the middle)").optional(),
      y: num(0, 1, "Center down the code (0.5 is the middle)").optional(),
      shape: z
        .enum(LOGO_SHAPES)
        .optional()
        .describe("Crop the logo to this shape"),
      plate: hex("A plate behind the logo").optional(),
    })
    .describe("The logo's size, clear space, position, crop and plate"),
  autoLevel: z
    .boolean()
    .describe("Raise error correction to H when the logo covers a lot"),
});

const styleSchemaOf = (builders: Builders) => {
  const { hex } = builders;
  const gradientSchema = gradientSchemaOf(builders);
  return z.object({
    bgColor: hex("Background color"),
    fgColor: hex("Color of the dots (data modules)"),
    eyeColor: hex("Color of the three corner eye frames"),
    dotColor: hex("Color of the corner eye centers"),
    bodyPattern: bodyPatternSchema.describe("Shape of the dots"),
    cornerEyePattern: pickableCornerEyePatternSchema.describe(
      "Shape of the corner eye frames",
    ),
    cornerEyeDotPattern: pickableCornerEyeDotPatternSchema.describe(
      "Shape of the corner eye centers",
    ),
    gradients: z
      .object({
        body: gradientSchema.optional(),
        background: gradientSchema.optional(),
        eyes: gradientSchema.optional(),
        eyeCentres: gradientSchema.optional(),
      })
      .optional()
      .describe(
        "Optional gradients; leave a part out for its solid color. Each gradient's colors must contrast with the background like the solid ones",
      ),
    margin: z
      .number()
      .int()
      .min(0)
      .max(MARGIN_MAX)
      .describe("Quiet zone around the code, in modules (4 is ideal)"),
    level: z
      .enum(ERROR_LEVELS)
      .describe(
        "Error correction: L 7%, M 15%, Q 25%, H 30% (use H with a logo)",
      ),
    frame: frameSchemaOf(builders),
    templateId: z
      .enum(TEMPLATE_IDS)
      .describe('Decorative border template; "default" for none'),
    logo: z
      .union([
        z.enum(LOGO_CHOICES),
        z.string().regex(LOGO_ICON_PATTERN, "A quick icon or a brand slug"),
      ])
      .describe(
        "Center logo: none, keep (the current one), qrdx, a quick icon (wifi, location, phone, email, link, file, calendar, whatsapp, instagram) or any brand by its Simple Icons slug (spotify, paypal, googlemaps; add :black or :white for those colors)",
      ),
  });
};

/** A built-in frame (the MCP tool's frame input). */
export const designFrameSchema = builtInFrameSchemaOf(strict);

const strictLooks = lookFieldsOf(strict);

/** The complete look of a code (no content); the looks are optional. */
export const designStyleSchema = styleSchemaOf(strict).extend(
  Object.fromEntries(
    LOOK_KEYS.map((key) => [key, strictLooks[key].optional()]),
  ) as { [K in LookKey]: z.ZodOptional<(typeof strictLooks)[K]> },
);

const looseLooks = lookFieldsOf(loose);

const EYE_NAMES = {
  topLeft: ["TopLeft", "top-left"],
  topRight: ["TopRight", "top-right"],
  bottomLeft: ["BottomLeft", "bottom-left"],
} as const satisfies Record<EyePosition, readonly [string, string]>;

type FlatEyeKey =
  `eye${"" | "Center"}${"Color" | "Shape"}${"TopLeft" | "TopRight" | "BottomLeft"}`;

/**
 * The per-eye looks as the designer writes them: one flat field per eye and
 * part (eyeColorTopLeft, eyeCenterShapeBottomLeft...). Nested per-eye
 * objects made Gemini loop inside them.
 */
const FLAT_EYE_FIELDS = (["eyeColors", "eyeShapes"] as const).flatMap((look) =>
  EYE_POSITIONS.flatMap((position) =>
    (["outer", "inner"] as const).map((part) => ({
      key: `eye${part === "inner" ? "Center" : ""}${look === "eyeColors" ? "Color" : "Shape"}${EYE_NAMES[position][0]}` as FlatEyeKey,
      look,
      position,
      part,
      what: `The ${EYE_NAMES[position][1]} eye's ${part === "inner" ? "center" : "frame"} ${look === "eyeColors" ? "color" : "shape"}`,
    })),
  ),
);
const FLAT_EYE_KEYS = FLAT_EYE_FIELDS.map((field) => field.key);

/** A designer answer (or part of one) without its looks: colors, shapes, frame. */
export function withoutDesignerLooks<T extends object>(answer: T): Partial<T> {
  const core = { ...answer } as Record<string, unknown>;
  for (const key of [...LOOK_KEYS, ...FLAT_EYE_KEYS]) delete core[key];
  return core as Partial<T>;
}

const flatEyeSchema = (field: (typeof FLAT_EYE_FIELDS)[number]) => {
  if (field.look === "eyeColors") return loose.hex(field.what);
  const shapes =
    field.part === "outer"
      ? pickableCornerEyePatternSchema
      : pickableCornerEyeDotPatternSchema;
  return shapes.describe(field.what);
};

const {
  eyeColors: _eyeColors,
  eyeShapes: _eyeShapes,
  ...looseOtherLooks
} = looseLooks;
type OtherLookKey = Exclude<LookKey, "eyeColors" | "eyeShapes">;

/**
 * The designer model's output: the same shape with plain strings and
 * numbers, per-eye looks in flat fields. A look left out keeps the value it
 * starts from; null turns it off (sanitizeDesignStyle).
 */
export const designerOutputSchema = styleSchemaOf(loose)
  .extend(
    Object.fromEntries(
      Object.entries(looseOtherLooks).map(([key, schema]) => [
        key,
        schema.nullable().optional(),
      ]),
    ) as {
      [K in OtherLookKey]: z.ZodOptional<z.ZodNullable<(typeof looseLooks)[K]>>;
    },
  )
  .extend(
    Object.fromEntries(
      FLAT_EYE_FIELDS.map((field) => [
        field.key,
        flatEyeSchema(field).nullable().optional(),
      ]),
    ) as unknown as Record<
      FlatEyeKey,
      z.ZodOptional<z.ZodNullable<z.ZodType<string>>>
    >,
  );

export type DesignStyle = z.infer<typeof designStyleSchema>;
export type DesignFrame = DesignStyle["frame"];
/** A designer answer (the designer model's structured output). */
export type DesignerOutput = z.infer<typeof designerOutputSchema>;

/**
 * One per-eye look from the designer's flat fields over `inherited`: a
 * field left out keeps that eye's part, null clears it.
 */
function eyesFromFlat(
  raw: Record<string, unknown>,
  look: "eyeColors" | "eyeShapes",
  inherited: unknown,
): unknown {
  const out: Record<string, Record<string, unknown>> = JSON.parse(
    JSON.stringify(inherited ?? {}),
  );
  for (const field of FLAT_EYE_FIELDS) {
    if (field.look !== look) continue;
    const value = raw[field.key];
    if (value === undefined) continue;
    const eye = out[field.position] ?? {};
    if (value === null) delete eye[field.part];
    else eye[field.part] = value;
    out[field.position] = eye;
  }
  return out;
}

/** The first #RRGGBB (or #RGB) in a model's color, or `fallback`. */
function cleanHex(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const long = /#[0-9a-fA-F]{6}(?![0-9a-fA-F])/.exec(value)?.[0];
  if (long) return long.toUpperCase();
  const short = /#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])(?![0-9a-fA-F])/.exec(
    value,
  );
  return short
    ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase()
    : fallback;
}

/** The #RRGGBB in `value`, or undefined. */
const hexOrNone = (value: unknown) => cleanHex(value, "") || undefined;

const cleanLabel = (value: unknown) =>
  typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, FRAME_TEXT_MAX_LENGTH)
    : undefined;

/** `value` clamped to [min, max], or undefined when it isn't a number. */
const clamp = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : undefined;

/** An object without its undefined fields, or undefined when none is left. */
function compact<T extends object>(value: T): T | undefined {
  const entries = Object.entries(value).filter(
    ([, item]) => item !== undefined,
  );
  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined;
}

const pickOf = <T extends string>(options: readonly T[], value: unknown) =>
  options.includes(value as T) ? (value as T) : undefined;

type PerEye<T> = Partial<Record<EyePosition, T>>;

function perEye<T extends object>(
  value: unknown,
  clean: (eye: Record<string, unknown>) => T | undefined,
): PerEye<T> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const out: PerEye<T> = {};
  for (const position of EYE_POSITIONS) {
    const eye = (value as Record<string, unknown>)[position];
    const cleaned =
      eye && typeof eye === "object"
        ? clean(eye as Record<string, unknown>)
        : undefined;
    if (cleaned) out[position] = cleaned;
  }
  return compact(out);
}

/**
 * Every look in `raw` made valid (colors reduced to #RRGGBB, numbers clamped
 * to their range), or dropped when nothing valid is left.
 */
function cleanLooks(
  raw: Partial<Record<LookKey, unknown>>,
): Partial<Pick<DesignStyle, LookKey>> {
  const eyeColors = perEye(raw.eyeColors, (eye) =>
    compact({ outer: hexOrNone(eye.outer), inner: hexOrNone(eye.inner) }),
  );
  const eyeShapes = perEye(raw.eyeShapes, (eye) =>
    compact({
      outer: pickOf(CORNER_EYE_PATTERNS, eye.outer),
      inner: pickOf(CORNER_EYE_DOT_PATTERNS, eye.inner),
    }),
  );
  const moduleScale = clamp(
    raw.moduleScale,
    MODULE_SCALE_MIN,
    MODULE_SCALE_MAX,
  );
  const shape = pickOf(DESIGN_SHAPES, raw.shape);
  const bgRadius = clamp(raw.bgRadius, 0, BG_RADIUS_MAX);
  const halo =
    raw.halo && typeof raw.halo === "object"
      ? (raw.halo as Record<string, unknown>)
      : null;
  const shadow =
    raw.shadow && typeof raw.shadow === "object"
      ? (raw.shadow as Record<string, unknown>)
      : null;
  const logo =
    raw.logoOptions && typeof raw.logoOptions === "object"
      ? (raw.logoOptions as Record<string, unknown>)
      : null;
  const logoOptions = logo
    ? compact({
        size: clamp(logo.size, LOGO_SIZE_MIN, LOGO_SIZE_MAX),
        padding: clamp(logo.padding, 0, LOGO_PADDING_MAX),
        x: clamp(logo.x, 0, 1),
        y: clamp(logo.y, 0, 1),
        shape: pickOf(LOGO_SHAPES, logo.shape),
        plate: hexOrNone(logo.plate),
      })
    : undefined;
  return (
    compact({
      eyeColors,
      eyeShapes,
      eyeGradient: raw.eyeGradient === "code" ? ("code" as const) : undefined,
      // Full size is the default: left out
      moduleScale:
        moduleScale !== undefined && moduleScale < 1 ? moduleScale : undefined,
      // Square is the default: left out
      shape: shape === "circle" || shape === "heart" ? shape : undefined,
      bgRadius: bgRadius ? bgRadius : undefined,
      backdrop: bgRadius ? hexOrNone(raw.backdrop) : undefined,
      // A halo or shadow object turns it on; its fields default in the engine
      halo: halo
        ? (compact({
            color: hexOrNone(halo.color),
            width: clamp(halo.width, HALO_WIDTH_MIN, HALO_WIDTH_MAX),
          }) ?? {})
        : undefined,
      shadow: shadow
        ? (compact({
            color: hexOrNone(shadow.color),
            opacity: clamp(
              shadow.opacity,
              SHADOW_OPACITY_MIN,
              SHADOW_OPACITY_MAX,
            ),
            dx: clamp(shadow.dx, -SHADOW_OFFSET_MAX, SHADOW_OFFSET_MAX),
            dy: clamp(shadow.dy, -SHADOW_OFFSET_MAX, SHADOW_OFFSET_MAX),
          }) ?? {})
        : undefined,
      logoOptions,
      autoLevel: raw.autoLevel === true ? true : undefined,
    }) ?? {}
  );
}

export interface SanitizeOptions {
  /**
   * The style a look left out of the answer is taken from: the current
   * style when changing it, the candidate when revising one. Without it, a
   * look left out is off (a new design).
   */
  inherit?: DesignStyle;
  /** Whether an official frame id exists (server side); unknown ids are dropped */
  isOfficialFrame?: (id: string) => boolean;
  /** The code has a custom frame of its own ("keep") */
  hasOwnFrame?: boolean;
}

/** The frame of a designer answer made valid, or `fallback`'s. */
function cleanFrame(
  frame: DesignerOutput["frame"],
  fallback: DesignFrame,
  { isOfficialFrame, hasOwnFrame = false }: SanitizeOptions,
): DesignFrame {
  const text = cleanLabel(frame.text);
  const secondaryText = cleanLabel(frame.secondaryText);
  const color = hexOrNone(frame.color);
  const textColor = hexOrNone(frame.textColor);
  const labels = {
    ...(text !== undefined ? { text } : {}),
    ...(secondaryText ? { secondaryText } : {}),
    ...(color ? { color } : {}),
    ...(textColor ? { textColor } : {}),
  };
  if (frame.style === "official") {
    const id = frame.id?.trim().toLowerCase();
    if (!(id && isOfficialFrame?.(id))) {
      return fallback.style === "official" || fallback.style === "keep"
        ? fallback
        : { style: "none" };
    }
    return { style: "official", id, ...labels };
  }
  if (frame.style === "keep") {
    return hasOwnFrame ? { style: "keep", ...labels } : { style: "none" };
  }
  return { style: frame.style, ...labels };
}

/** A logo choice made valid: a choice, a brand slug, or `fallback`. */
function cleanLogo(value: unknown, fallback: LogoChoice): LogoChoice {
  if (isLogoChoice(value)) return value;
  if (typeof value !== "string") return fallback;
  const slug = value.trim().toLowerCase();
  return LOGO_ICON_PATTERN.test(slug) ? slug : fallback;
}

/**
 * A designer answer made valid: colors reduced to the #RRGGBB they contain
 * (or the fallback style's), labels clipped to the frame limit, looks
 * cleaned, a look left out taken from `inherit` and a null one turned off.
 */
export function sanitizeDesignStyle(
  raw: DesignerOutput,
  fallback: DesignStyle,
  options: SanitizeOptions = {},
): DesignStyle {
  const gradient = (value: GradientInput | undefined, from: string) =>
    value
      ? {
          ...value,
          from: cleanHex(value.from, from),
          to: cleanHex(value.to, from),
        }
      : undefined;
  const fg = cleanHex(raw.fgColor, fallback.fgColor);
  const bg = cleanHex(raw.bgColor, fallback.bgColor);
  const gradients = raw.gradients
    ? Object.fromEntries(
        Object.entries({
          body: gradient(raw.gradients.body, fg),
          background: gradient(raw.gradients.background, bg),
          eyes: gradient(raw.gradients.eyes, fg),
          eyeCentres: gradient(raw.gradients.eyeCentres, fg),
        }).filter(([, value]) => value),
      )
    : undefined;
  // Looks: the answer's (in percents), else inherited; null is off
  const lookInput: Partial<Record<LookKey, unknown>> = {};
  for (const key of LOOK_KEYS) {
    if (key === "eyeColors" || key === "eyeShapes") {
      lookInput[key] = eyesFromFlat(
        raw as Record<string, unknown>,
        key,
        options.inherit?.[key],
      );
      continue;
    }
    const value = (raw as Record<string, unknown>)[key];
    if (value === null) continue;
    lookInput[key] =
      value === undefined
        ? options.inherit?.[key]
        : scaleLook(key, value, 1 / 100);
  }
  const { frame: _frame, logo: _logo, gradients: _gradients, ...core } = raw;
  for (const key of [...LOOK_KEYS, ...FLAT_EYE_KEYS]) {
    delete (core as Record<string, unknown>)[key];
  }
  // A frame cut off before its style (an answer recovered from a runaway)
  // is the fallback's
  const frame =
    raw.frame &&
    typeof raw.frame === "object" &&
    (DESIGN_FRAME_STYLES as readonly string[]).includes(raw.frame.style)
      ? raw.frame
      : (fallback.frame as DesignerOutput["frame"]);
  return {
    ...cleanCore(core as Record<string, unknown>, fallback),
    bgColor: bg,
    fgColor: fg,
    eyeColor: cleanHex(raw.eyeColor, fg),
    dotColor: cleanHex(raw.dotColor, fg),
    ...(gradients && Object.keys(gradients).length > 0 ? { gradients } : {}),
    frame: cleanFrame(frame, fallback.frame, options),
    logo: cleanLogo(raw.logo, fallback.logo),
    ...cleanLooks(lookInput),
  } as DesignStyle;
}

/** A core value the strict schema takes, or the fallback's. */
const valid = <T>(schema: z.ZodType<T>, value: unknown, fallback: T): T => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
};

/**
 * Shapes, margin, level and border of an answer, each the fallback's when
 * it is missing or not a value the schema takes (an answer cut off in a
 * runaway stops partway).
 */
function cleanCore(
  core: Record<string, unknown>,
  fallback: DesignStyle,
): Pick<
  DesignStyle,
  | "bodyPattern"
  | "cornerEyePattern"
  | "cornerEyeDotPattern"
  | "margin"
  | "level"
  | "templateId"
> {
  return {
    bodyPattern: valid(
      bodyPatternSchema,
      core.bodyPattern,
      fallback.bodyPattern,
    ),
    cornerEyePattern: valid(
      pickableCornerEyePatternSchema,
      core.cornerEyePattern,
      fallback.cornerEyePattern,
    ),
    cornerEyeDotPattern: valid(
      pickableCornerEyeDotPatternSchema,
      core.cornerEyeDotPattern,
      fallback.cornerEyeDotPattern,
    ),
    margin: valid(
      z.number().int().min(0).max(MARGIN_MAX),
      core.margin,
      fallback.margin,
    ),
    level: valid(z.enum(ERROR_LEVELS), core.level, fallback.level),
    templateId: valid(
      z.enum(TEMPLATE_IDS),
      core.templateId,
      fallback.templateId,
    ),
  };
}

/** A plain black-on-white code: what a design falls back to. */
export const CLASSIC_STYLE: DesignStyle = {
  bgColor: "#FFFFFF",
  fgColor: "#000000",
  eyeColor: "#000000",
  dotColor: "#000000",
  bodyPattern: "square",
  cornerEyePattern: "square",
  cornerEyeDotPattern: "square",
  margin: 4,
  level: "Q",
  frame: { style: "none" },
  templateId: "default",
  logo: "none",
};

const toColor = (
  solid: string,
  gradient: GradientInput | undefined,
): ColorConfig => {
  if (!gradient) return solid;
  const stops = [
    { color: gradient.from, offset: 0 },
    { color: gradient.to, offset: 100 },
  ];
  return gradient.type === "linear"
    ? { type: "linear", stops, angle: gradient.angle ?? 0 }
    : { type: "radial", stops };
};

/**
 * Where the frames a design names but doesn't hold come from: an official
 * frame's spec (the catalogue is server-only), and the code's own custom
 * frame for "keep".
 */
export interface StyleSources {
  officialFrame?: (id: string) => FrameSpec | undefined;
  ownFrame?: QRCustomFrame;
}

const frameLabels = (frame: DesignFrame) => ({
  ...(frame.text?.trim() ? { text: frame.text.trim() } : {}),
  ...(frame.secondaryText?.trim()
    ? { secondaryText: frame.secondaryText.trim() }
    : {}),
  ...(frame.color ? { color: frame.color } : {}),
  ...(frame.textColor ? { textColor: frame.textColor } : {}),
});

/**
 * Frame props the engine renders, or undefined for "none" (and for an
 * official or kept frame `sources` can't supply).
 */
export function toFrame(
  frame: DesignFrame,
  sources: StyleSources = {},
): AnyQRFrame | undefined {
  if (frame.style === "none") return undefined;
  if (frame.style === "official") {
    const spec = frame.id ? sources.officialFrame?.(frame.id) : undefined;
    return spec ? { style: "custom", spec, ...frameLabels(frame) } : undefined;
  }
  if (frame.style === "keep") {
    return sources.ownFrame
      ? { ...sources.ownFrame, ...frameLabels(frame) }
      : undefined;
  }
  return {
    ...frameLabels(frame),
    style: frame.style,
    text: frame.text?.trim() || DEFAULT_FRAME_TEXT,
  };
}

/** How the logo shows, apart from which image (icons resolve in the browser). */
export interface LogoSetting {
  showLogo: boolean;
  /** The image source: the current logo, the QRdx mark, or a logoIcon */
  source: string | null;
}

export function toLogoSetting(logo: LogoChoice): LogoSetting {
  if (logo === "none") return { showLogo: false, source: null };
  return { showLogo: true, source: logo };
}

/** The looks of a design as ThemeStyles fields. */
function looksToThemeStyles(design: DesignStyle): Partial<ThemeStyles> {
  const { shape, ...looks } = Object.fromEntries(
    LOOK_KEYS.filter((key) => design[key] !== undefined).map((key) => [
      key,
      design[key],
    ]),
  ) as Partial<Pick<DesignStyle, LookKey>>;
  return {
    ...looks,
    ...(shape === "circle" || shape === "heart" ? { shape } : {}),
  } as Partial<ThemeStyles>;
}

/**
 * The editor's ThemeStyles for a design, without the logo image (the
 * browser resolves icons and keeps an uploaded logo; see LogoSetting).
 */
export function toThemeStyles(
  design: DesignStyle,
  sources: StyleSources = {},
): ThemeStyles {
  const gradients = design.gradients ?? {};
  const frame = toFrame(design.frame, sources);
  return {
    bgColor: toColor(design.bgColor, gradients.background),
    fgColor: toColor(design.fgColor, gradients.body),
    eyeColor: toColor(design.eyeColor, gradients.eyes),
    dotColor: toColor(design.dotColor, gradients.eyeCentres),
    bodyPattern: design.bodyPattern,
    cornerEyePattern: design.cornerEyePattern,
    cornerEyeDotPattern: design.cornerEyeDotPattern,
    margin: design.margin,
    level: design.level,
    ...(frame ? { frame } : {}),
    ...(design.templateId !== "default"
      ? { templateId: design.templateId }
      : {}),
    ...looksToThemeStyles(design),
    showLogo: design.logo !== "none",
  };
}

const solidHex = (color: ColorConfig | undefined, fallback: string) => {
  const solid = getSolidColor(color, fallback);
  return typeof solid === "string" && HEX_COLOR.test(solid)
    ? solid.toUpperCase()
    : fallback;
};

const gradientOf = (color: ColorConfig | undefined) => {
  if (!color || typeof color === "string" || !isGradient(color)) {
    return undefined;
  }
  const from = color.stops[0]?.color;
  const to = color.stops.at(-1)?.color;
  if (!(from && to && HEX_COLOR.test(from) && HEX_COLOR.test(to))) {
    return undefined;
  }
  return color.type === "linear"
    ? { type: "linear" as const, from, to, angle: Math.round(color.angle ?? 0) }
    : { type: "radial" as const, from, to };
};

const pick = <T extends string>(
  options: readonly T[],
  value: unknown,
  fallback: T,
): T => (options.includes(value as T) ? (value as T) : fallback);

export interface FromThemeStylesOptions {
  /** The official frame a custom frame's spec is a copy of (server side) */
  officialFrameId?: (spec: FrameSpec) => string | undefined;
  /**
   * Describe a custom frame of the code's own as "keep" (the chat keeps
   * it); without it, it becomes no frame.
   */
  keepOwn?: boolean;
}

/** The frame of editor styles as a design frame. */
function frameOf(
  frame: ThemeStyles["frame"],
  { officialFrameId, keepOwn = false }: FromThemeStylesOptions,
): DesignFrame {
  if (!frame || frame.style === "none") return { style: "none" };
  const labels = {
    ...(frame.text !== undefined ? { text: frame.text } : {}),
    ...(frame.secondaryText ? { secondaryText: frame.secondaryText } : {}),
    ...(frame.color && HEX_COLOR.test(frame.color)
      ? { color: frame.color }
      : {}),
    ...(frame.textColor && HEX_COLOR.test(frame.textColor)
      ? { textColor: frame.textColor }
      : {}),
  };
  if (frame.style === "custom") {
    const id = officialFrameId?.(frame.spec);
    if (id) return { style: "official", id, ...labels };
    return keepOwn ? { style: "keep", ...labels } : { style: "none" };
  }
  return { style: frame.style, ...labels };
}

/** The looks of editor styles, valid ones only (a silhouette never). */
function looksOf(styles: ThemeStyles): Partial<Pick<DesignStyle, LookKey>> {
  const eyeColors = styles.eyeColors
    ? Object.fromEntries(
        Object.entries(styles.eyeColors).map(([position, eye]) => [
          position,
          eye && {
            outer: solidHexOrNone(eye.outer),
            inner: solidHexOrNone(eye.inner),
          },
        ]),
      )
    : undefined;
  return cleanLooks({
    eyeColors,
    eyeShapes: styles.eyeShapes,
    eyeGradient: styles.eyeGradient,
    moduleScale: styles.moduleScale,
    shape: styles.silhouette ? undefined : styles.shape,
    bgRadius: styles.bgRadius,
    backdrop: styles.backdrop,
    halo: styles.halo,
    shadow: styles.shadow,
    logoOptions: styles.logoOptions,
    autoLevel: styles.autoLevel,
  });
}

/** A solid #RRGGBB color, or undefined for a gradient, image or other color. */
function solidHexOrNone(color: ColorConfig | undefined) {
  return typeof color === "string" && HEX_COLOR.test(color)
    ? color.toUpperCase()
    : undefined;
}

/**
 * The design that matches editor styles, as the starting point for a
 * change ("make it darker"). Values the schema can't express (a retired
 * shape, an rgba color, a gradient on one eye) fall back to safe ones.
 */
export function fromThemeStyles(
  styles: ThemeStyles,
  logo: { showLogo: boolean } = { showLogo: Boolean(styles.showLogo) },
  options: FromThemeStylesOptions = {},
): DesignStyle {
  const fg = solidHex(styles.fgColor, "#000000");
  const gradients = {
    body: gradientOf(styles.fgColor),
    background: gradientOf(styles.bgColor),
    eyes: gradientOf(styles.eyeColor),
    eyeCentres: gradientOf(styles.dotColor),
  };
  const hasGradient = Object.values(gradients).some(Boolean);
  return {
    bgColor: solidHex(styles.bgColor, "#FFFFFF"),
    fgColor: fg,
    eyeColor: solidHex(styles.eyeColor, fg),
    dotColor: solidHex(styles.dotColor, fg),
    bodyPattern: pick(BODY_PATTERN, styles.bodyPattern, "square"),
    cornerEyePattern: pick(
      CORNER_EYE_PATTERNS,
      styles.cornerEyePattern,
      "rounded",
    ),
    cornerEyeDotPattern: pick(
      CORNER_EYE_DOT_PATTERNS,
      styles.cornerEyeDotPattern,
      "rounded",
    ),
    ...(hasGradient
      ? {
          gradients: Object.fromEntries(
            Object.entries(gradients).filter(([, value]) => value),
          ),
        }
      : {}),
    margin: Math.min(
      MARGIN_MAX,
      Math.max(0, Math.round(styles.margin ?? CLASSIC_STYLE.margin)),
    ),
    level: pick(ERROR_LEVELS, styles.level, "Q"),
    frame: frameOf(styles.frame, options),
    templateId: pick(TEMPLATE_IDS, styles.templateId, "default"),
    logo: logo.showLogo ? "keep" : "none",
    ...looksOf(styles),
  };
}

const PLAIN_NAMES: Record<string, string> = {
  bgColor: "background",
  fgColor: "dots",
  eyeColor: "corner eyes",
  dotColor: "eye centers",
  bodyPattern: "dot shape",
  cornerEyePattern: "eye shape",
  cornerEyeDotPattern: "eye center shape",
  margin: "margin",
  level: "error correction",
  frame: "frame",
  templateId: "border",
  logo: "logo",
  gradients: "gradients",
  eyeColors: "colors of single eyes",
  eyeShapes: "shapes of single eyes",
  eyeGradient: "eye gradient",
  moduleScale: "dot size",
  shape: "outline",
  bgRadius: "rounded corners",
  backdrop: "backdrop",
  halo: "halo",
  shadow: "shadow",
  logoOptions: "logo layout",
  autoLevel: "auto error correction",
};

/** "topLeft frame circle, bottomLeft center dots" for a per-eye option. */
const describePerEye = (value: PerEye<{ outer?: string; inner?: string }>) =>
  Object.entries(value)
    .flatMap(([position, eye]) =>
      [
        eye?.outer ? `${position} frame ${eye.outer}` : "",
        eye?.inner ? `${position} center ${eye.inner}` : "",
      ].filter(Boolean),
    )
    .join(", ");

const describeValue = (key: string, value: unknown): string => {
  if (value === undefined) return "none";
  if (key === "frame") {
    const frame = value as DesignFrame;
    if (frame.style === "none") return "none";
    const name =
      frame.style === "official"
        ? `official ${frame.id}`
        : frame.style === "keep"
          ? "your own"
          : frame.style;
    return `${name}${frame.text ? ` "${frame.text}"` : ""}`;
  }
  if (key === "templateId") return value === "default" ? "none" : String(value);
  if (key === "gradients") {
    const entries = Object.entries((value ?? {}) as object);
    return entries.length ? entries.map(([part]) => part).join(", ") : "none";
  }
  if (key === "eyeColors" || key === "eyeShapes") {
    return describePerEye(value as PerEye<{ outer?: string; inner?: string }>);
  }
  if (typeof value === "object" && value) {
    const entries = Object.entries(value);
    return entries.length
      ? entries.map(([field, item]) => `${field} ${item}`).join(", ")
      : "on";
  }
  if (value === true) return "on";
  return String(value);
};

/** "dots #1E3A8A → #111111" lines for every option that differs. */
export function styleDiff(
  before: DesignStyle | null,
  after: DesignStyle,
): { key: string; label: string; from?: string; to: string }[] {
  return (Object.keys(PLAIN_NAMES) as (keyof DesignStyle)[]).flatMap((key) => {
    const next = after[key];
    const previous = before?.[key];
    if (JSON.stringify(previous ?? null) === JSON.stringify(next ?? null)) {
      return [];
    }
    return [
      {
        key,
        label: PLAIN_NAMES[key] ?? key,
        ...(previous !== undefined
          ? { from: describeValue(key, previous) }
          : {}),
        to: describeValue(key, next),
      },
    ];
  });
}
