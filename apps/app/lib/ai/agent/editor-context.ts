// The code in the user's editor, sent with every chat request so "make it
// darker" and "add a frame" start from what is on screen. QRdx's server uses
// the content to score designs; the model only sees the content type and the
// style, never the content's values (a Wi-Fi password, a phone number).
import {
  anyFrameSchema,
  colorConfigSchema,
  eyeColorsSchema,
  eyeGradientSpanSchema,
  eyeShapesSchema,
  haloSchema,
  logoOptionsSchema,
  qrShapeSchema,
  shadowSchema,
} from "qrdx/types";
import { z } from "zod";
import { withoutImageFills } from "@/lib/paint/image-fills";
import {
  CONTENT_TYPE_IDS,
  contentTypeLabel,
  validateDesignContent,
} from "@/lib/qr-design/content";
import { withTemplateAsFrame } from "@/lib/qr-design/legacy-template";
import {
  OFFICIAL_FRAME_SOURCES,
  officialFrameId,
} from "@/lib/qr-design/official-frames";
import {
  type DesignStyle,
  fromThemeStyles,
  type StyleSources,
} from "@/lib/qr-design/style";
import type { ContentType, QRContentConfig } from "@/types/qr-content";
import type { ThemeStyles } from "@/types/theme";

/** Largest logo the client sends along (an uploaded image as a data URL). */
export const MAX_CONTEXT_LOGO_LENGTH = 200_000;

/** Payload limit of a QR code, with room for escaping. */
const MAX_VALUE_LENGTH = 4096;

/** An option the chat can do without: a value it can't read is dropped. */
const lenient = <T extends z.ZodType>(schema: T) =>
  schema.optional().catch(undefined);

const styleSchema = z
  .looseObject({
    bgColor: colorConfigSchema.optional(),
    fgColor: colorConfigSchema.optional(),
    eyeColor: colorConfigSchema.optional(),
    dotColor: colorConfigSchema.optional(),
    bodyPattern: z.string().max(40).optional(),
    cornerEyePattern: z.string().max(40).optional(),
    cornerEyeDotPattern: z.string().max(40).optional(),
    level: z.string().max(2).optional(),
    margin: z.number().min(0).max(64).optional(),
    // A built-in frame, or a custom one (an official frame, or the user's own)
    frame: lenient(anyFrameSchema),
    showLogo: z.boolean().optional(),
    // The looks (lib/qr-design/style.ts LOOK_KEYS)
    eyeColors: lenient(eyeColorsSchema),
    eyeShapes: lenient(eyeShapesSchema),
    eyeGradient: lenient(eyeGradientSpanSchema),
    moduleScale: lenient(z.number()),
    shape: lenient(qrShapeSchema),
    bgRadius: lenient(z.number()),
    backdrop: lenient(z.string().max(64)),
    halo: lenient(haloSchema),
    shadow: lenient(shadowSchema),
    logoOptions: lenient(logoOptionsSchema),
    autoLevel: lenient(z.boolean()),
  })
  .transform((input) => {
    // Only what a design is built from: no art images or other extras, and
    // never a silhouette (traced from an upload; the client leaves it out),
    // only whether the code has one. An editor still holding a template
    // (from before templates were frames) sends its frame.
    const {
      bgColor,
      fgColor,
      eyeColor,
      dotColor,
      bodyPattern,
      cornerEyePattern,
      cornerEyeDotPattern,
      level,
      margin,
      frame,
      showLogo,
      eyeColors,
      eyeShapes,
      eyeGradient,
      moduleScale,
      shape,
      bgRadius,
      backdrop,
      halo,
      shadow,
      logoOptions,
      autoLevel,
    } = withTemplateAsFrame(input);
    return withoutImageFills({
      // Pictures never reach the model: an image fill counts as its
      // underlay color (the client strips them too)
      bgColor,
      fgColor,
      eyeColor,
      dotColor,
      bodyPattern,
      cornerEyePattern,
      cornerEyeDotPattern,
      level,
      margin,
      frame,
      showLogo,
      eyeColors,
      eyeShapes,
      eyeGradient,
      moduleScale,
      shape,
      bgRadius,
      backdrop,
      halo,
      shadow,
      logoOptions,
      autoLevel,
    } as ThemeStyles);
  });

export const editorContextSchema = z.object({
  contentType: z.enum(CONTENT_TYPE_IDS),
  /** The content form's fields for that type */
  content: z.record(z.string(), z.unknown()).optional(),
  /** The encoded payload the preview shows (a short link for dynamic codes) */
  value: z.string().max(MAX_VALUE_LENGTH),
  style: styleSchema,
  /** The logo image when the code shows one (left out when too large) */
  customLogo: z.string().max(MAX_CONTEXT_LOGO_LENGTH).optional(),
  /** Logo QR / Image QR art is on (AI designs replace it) */
  hasArt: z.boolean().default(false),
  /** The code is drawn in a silhouette of the user's own (AI designs replace it) */
  hasSilhouette: z.boolean().default(false),
});

export type EditorContextInput = z.input<typeof editorContextSchema>;
export type EditorContext = z.output<typeof editorContextSchema>;

/** A typical short link, scored when the editor has no content yet. */
export const SAMPLE_VALUE = "https://qrdx.dev/q/Ab3dE9x";

export interface EditorBase {
  contentType: ContentType;
  /** The editor's content, when its form is valid */
  content: QRContentConfig | null;
  /** What designs are scored with until the chat sets new content */
  value: string;
  valueIsSample: boolean;
  /** The look as a design (what design_qr starts from) */
  style: DesignStyle;
  /** The editor's own styles, as sent (what check_scan_score scores) */
  rawStyle: ThemeStyles;
  hasLogo: boolean;
  customLogo?: string;
  hasArt: boolean;
  hasSilhouette: boolean;
  /** Where the style's official frame or own frame ("keep") is drawn from */
  sources: StyleSources;
}

export function editorBase(context: EditorContext | undefined): EditorBase {
  if (!context) {
    return {
      contentType: "url",
      content: null,
      value: SAMPLE_VALUE,
      valueIsSample: true,
      style: fromThemeStyles({}, { showLogo: false }),
      rawStyle: {},
      hasLogo: false,
      hasArt: false,
      hasSilhouette: false,
      sources: OFFICIAL_FRAME_SOURCES,
    };
  }
  const content = context.content
    ? validateDesignContent({
        ...(context.content as Record<string, string | boolean>),
        type: context.contentType,
      })
    : null;
  const value = context.value.trim();
  const hasLogo = Boolean(context.style.showLogo);
  const frame = context.style.frame;
  // A custom frame that isn't an official one is the user's own: "keep"
  const ownFrame =
    frame?.style === "custom" && !officialFrameId(frame.spec)
      ? frame
      : undefined;
  return {
    contentType: context.contentType,
    content: content?.ok ? content.content : null,
    value: value || SAMPLE_VALUE,
    valueIsSample: !value,
    style: fromThemeStyles(
      context.style,
      { showLogo: hasLogo },
      { officialFrameId, keepOwn: true },
    ),
    rawStyle: context.style,
    hasLogo,
    ...(context.customLogo ? { customLogo: context.customLogo } : {}),
    hasArt: context.hasArt,
    hasSilhouette: context.hasSilhouette,
    sources: { ...OFFICIAL_FRAME_SOURCES, ...(ownFrame ? { ownFrame } : {}) },
  };
}

/** What the model is told about the editor: the type and look, no values. */
export function describeEditorForModel(base: EditorBase): string {
  const content = base.valueIsSample
    ? "No content yet."
    : `Content type: ${contentTypeLabel(base.contentType)} (${base.contentType}), filled in. Its values are private: you don't see them, and design_qr keeps them unless you pass new content.`;
  return [
    "# The code in the user's editor now",
    content,
    `Logo shown: ${base.hasLogo ? "yes" : "no"}.${base.hasArt ? " Logo QR / Image QR art is on; a new design replaces it." : ""}`,
    base.hasSilhouette
      ? "The code is drawn in a shape the user traced from a picture; a new design replaces it with a square, circle or heart code."
      : "",
    base.style.frame.style === "keep"
      ? "The frame is one of the user's own (frame style keep): designs keep it unless the user asks for another frame."
      : "",
    `Style: ${JSON.stringify(base.style)}`,
  ]
    .filter(Boolean)
    .join("\n");
}
