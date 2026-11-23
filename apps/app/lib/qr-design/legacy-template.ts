// Designs saved before qrdx 0.0.64 can name one of the engine's templates
// (`templateId`, with Dot Ring's settings in `customProps`). The templates
// are built-in frames now, so a design that names one is read as that
// frame: the frame draws the same artwork around the code. This is the one
// place the old template ids are read. Nothing stored is rewritten: the
// mapping runs wherever a stored design is read (saved themes, dynamic
// codes, brand kits, community items, playground links, the editor's own
// saved state), and a design saved again is saved with its frame.
import { type AnyQRFrame, FRAME_TEXT_MAX_LENGTH } from "qrdx/types";

interface TemplateFrame {
  /** The built-in frame style the template became */
  style: AnyQRFrame["style"];
  /**
   * Whether its artwork took the code's dark color (it paints with the
   * frame color; tests/lib/legacy-template.test.ts checks this against the
   * frame specs)
   */
  takesCodeColor: boolean;
}

/** The frame each template became ("default" drew no artwork). */
export const TEMPLATE_FRAMES: Readonly<Record<string, TemplateFrame | null>> = {
  default: null,
  Arrow: { style: "arrow", takesCodeColor: true },
  StandardBox: { style: "standard-box", takesCodeColor: true },
  SquareBorder: { style: "square-border", takesCodeColor: true },
  StrikedBox: { style: "striked-box", takesCodeColor: false },
  Halloween: { style: "pumpkin", takesCodeColor: false },
  DotRing: { style: "dot-ring", takesCodeColor: true },
  // Dot Ring's earlier id
  FlamQR: { style: "dot-ring", takesCodeColor: true },
};

/** The design fields a template lived in. */
type LegacyTemplateFields = {
  templateId?: unknown;
  customProps?: unknown;
};

/** The solid color a template took from a code color (its first stop for a gradient). */
function solidColorOf(color: unknown): string | undefined {
  if (typeof color === "string") return color || undefined;
  if (!color || typeof color !== "object") return undefined;
  const paint = color as {
    type?: unknown;
    color?: unknown;
    stops?: { color?: unknown }[];
    underlay?: unknown;
  };
  if (paint.type === "solid" && typeof paint.color === "string") {
    return paint.color;
  }
  if (paint.type === "image") {
    return typeof paint.underlay === "string" ? paint.underlay : undefined;
  }
  const first = Array.isArray(paint.stops) ? paint.stops[0]?.color : undefined;
  return typeof first === "string" ? first : undefined;
}

/**
 * Dot Ring's text as one frame label: a phrase repeated round the ring
 * ("Scan me * Scan me *") once, then cut after the last whole word that
 * fits a label.
 */
function ringLabel(text: string): string {
  const phrase =
    text
      .split(/\s*[*•·|]\s*/)
      .map((part) => part.trim())
      .find(Boolean) ?? "";
  if (phrase.length <= FRAME_TEXT_MAX_LENGTH) return phrase;
  const cut = phrase.slice(0, FRAME_TEXT_MAX_LENGTH + 1);
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : cut)
    .trim()
    .slice(0, FRAME_TEXT_MAX_LENGTH);
}

/** Dot Ring's text and colors (`customProps`) as frame options. */
function dotRingOptions(props: unknown): Partial<AnyQRFrame> {
  if (!props || typeof props !== "object") return {};
  const ring = props as Record<string, unknown>;
  const options: Record<string, string> = {};
  if (typeof ring.customText === "string") {
    const label = ringLabel(ring.customText);
    const repeated = ring.textFill === "repeat";
    // Its text went over the top (or along the bottom), once
    if (ring.textPosition === "bottom" && !repeated) {
      options.text = "";
      options.secondaryText = label;
    } else {
      options.text = label;
      options.secondaryText = repeated ? label : "";
    }
  }
  if (typeof ring.outerCircleColor === "string" && ring.outerCircleColor) {
    options.color = ring.outerCircleColor;
  }
  if (typeof ring.textColor === "string" && ring.textColor) {
    options.textColor = ring.textColor;
  }
  return options as Partial<AnyQRFrame>;
}

/** The frame a template id became, or null (none, or not a template). */
function frameOfTemplate(templateId: unknown): TemplateFrame | null {
  if (typeof templateId !== "string") return null;
  return Object.hasOwn(TEMPLATE_FRAMES, templateId)
    ? (TEMPLATE_FRAMES[templateId] ?? null)
    : null;
}

/**
 * `style` read as today's design: a template it names becomes the frame it
 * is now, and `templateId` and `customProps` go. The frame takes the code's
 * dark color where the template's artwork did, and Dot Ring keeps its text
 * and colors. A design with a frame of its own keeps that frame (the editor
 * showed it, and a frame was the one choice there). Anything else comes
 * back as it was (the same object).
 */
export function withTemplateAsFrame<T>(style: T): T {
  if (!style || typeof style !== "object" || Array.isArray(style)) {
    return style;
  }
  if (!("templateId" in style || "customProps" in style)) return style;
  const { templateId, customProps, ...rest } = style as T &
    LegacyTemplateFields & { frame?: AnyQRFrame | null };
  const current = (rest as { frame?: AnyQRFrame | null }).frame;
  const framed = Boolean(current?.style && current.style !== "none");
  const became = framed ? null : frameOfTemplate(templateId);
  if (!became) return rest as T;

  const frame: Record<string, unknown> = { style: became.style };
  // The artwork took the code's dark color
  const dark = solidColorOf((rest as { fgColor?: unknown }).fgColor);
  if (became.takesCodeColor && dark) frame.color = dark;
  if (became.style === "dot-ring") {
    Object.assign(frame, dotRingOptions(customProps));
  }
  return { ...rest, frame } as T;
}
