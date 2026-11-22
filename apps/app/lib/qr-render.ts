import "server-only";

import { ImageResponse } from "next/og";
import { getAllTemplates, QRCodeSVG, svgToEPS } from "qrdx";
import {
  BODY_PATTERN,
  type BodyPattern,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  type PickableCornerEyeDotPattern,
  type PickableCornerEyePattern,
} from "qrdx/types";
import {
  createElement,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { payloadEngineOptions } from "@/lib/qr-design/engine-options";
import {
  type ConvertedFormat,
  convertPng,
  ICO_MASTER_SIZE,
} from "@/lib/qr-image-formats";
import {
  QR_DATA_MAX_LENGTH,
  QR_DEFAULTS,
  QR_MARGIN_MAX,
  QR_SIZE_MAX,
  QR_SIZE_MIN,
  type QrOptions,
  toHex,
} from "@/lib/qr-image-url";
import { outlineSvgText } from "@/lib/qr-text-outline";

// The options, limits and the image URL live in lib/qr-image-url.ts (pure);
// importers of this module keep getting them here.
export {
  buildQrImageUrl,
  hexColor,
  QR_DATA_MAX_LENGTH,
  QR_DEFAULTS,
  QR_MARGIN_MAX,
  QR_SIZE_MAX,
  QR_SIZE_MIN,
  QR_TEMPLATE_IDS,
  type QrImageFormat,
  type QrOptions,
  qrImageFormats,
  qrOptionsSchema,
  readingWithdrawn,
} from "@/lib/qr-image-url";

// Server-side QR rendering shared by the public image API (/api/v1/qr) and the
// MCP server (/api/mcp). Output is deterministic: the same options always give
// the same SVG string and PNG bytes.

/** Thrown when the data does not fit in a QR code at the chosen level. */
export class QrDataTooLongError extends Error {
  constructor(level: string) {
    super(
      `Data is too long for a QR code at error correction level ${level}. Shorten it or use a lower level (L holds the most).`,
    );
    this.name = "QrDataTooLongError";
  }
}

const BODY_DESCRIPTIONS: Partial<Record<BodyPattern, string>> = {
  circle: "Round dots with small gaps",
  "circle-large": "Larger round dots that touch their neighbours",
  square: "Classic square modules",
  diamond: "Squares rotated 45 degrees",
  "circle-mixed": "Round dots in three alternating sizes",
  pacman: "Pill shapes with one rounded end, alternating direction",
  rounded: "Squares with rounded corners",
  "small-square": "Smaller squares with gaps",
  "vertical-line": "Vertical bar segments",
  "horizontal-line": "Horizontal bar segments",
  liquid: "Modules melt into smooth connected shapes",
  "liquid-horizontal": "Rounded capsules joined along rows",
  "liquid-vertical": "Rounded capsules joined along columns",
  classy: "Connected modules with two rounded opposite corners",
  "classy-rounded": "Connected modules with soft rounded corners",
  leaf: "Leaf-shaped tiles (two opposite corners rounded)",
  plus: "Plus signs",
  hexagon: "Hexagons",
  star: "Five-pointed stars",
  heart: "Hearts",
  "random-dots": "Dots in varied sizes (the same every time)",
  mosaic: "Slightly turned square tiles (the same every time)",
  octagon: "Octagons",
};

// Complete over the offered values (retired shapes are never listed)
const EYE_DESCRIPTIONS: Record<PickableCornerEyePattern, string> = {
  square: "Square frame",
  rounded: "Square frame with rounded corners",
  gear: "Decorative gear-like frame",
  circle: "Circular frame",
  diya: "Leaf-shaped frame with two rounded corners",
  "extra-rounded": "Square frame with very round corners",
  message: "Speech-bubble frame",
  pointy: "Frame with one pointed corner",
  leaf: "Leaf frame facing each corner (sharp outer and inner corners)",
  "leaf-reverse": "Leaf frame with round outer and inner corners",
  drop: "Teardrop frame with a sharp outer corner",
  petal: "Square frame with one big round outer corner",
  octagon: "Octagonal frame",
  bevel: "Square frame with cut corners",
  squircle: "Superellipse (squircle) frame",
  cushion: "Rounded frame with gently pinched sides",
  shield: "Shield-shaped frame",
  porthole: "Soft round frame around a square hole with cut corners",
  notch: "Square frame with a round bite out of each corner",
  plus: "Plus-shaped frame",
  bud: "Frame with round corners facing the code's corner and its center, cut corners elsewhere",
  bowl: "Frame with cut corners at the top and a round bottom",
};

const DOT_DESCRIPTIONS: Record<PickableCornerEyeDotPattern, string> = {
  square: "Square dot",
  rounded: "Square dot with rounded corners",
  circle: "Round dot",
  message: "Speech-bubble dot",
  "message-reverse": "Mirrored speech-bubble dot",
  diya: "Leaf-shaped dot",
  "diya-reverse": "Mirrored leaf-shaped dot",
  "rounded-triangle": "Rounded triangle dot",
  leaf: "Leaf-shaped dot facing each corner",
  "leaf-reverse": "Mirrored leaf-shaped dot",
  drop: "Teardrop dot with a sharp outer corner",
  "drop-reverse": "Teardrop dot pointing to the center of the code",
  plus: "Plus-shaped dot",
  "cross-rounded": "Cross with rounded arms",
  hexagon: "Hexagonal dot",
  octagon: "Octagonal dot",
  flower: "Four-petal flower",
  heart: "Heart dot",
  squircle: "Superellipse (squircle) dot",
  dots: "Grid of nine small dots",
  "extra-rounded": "Square dot with very round corners",
  cushion: "Square dot with gently pinched sides",
};

/**
 * Patterns, the frames drawn as templates and limits, for the MCP
 * `list_qr_styles` tool.
 */
export function getQrStyleCatalog() {
  return {
    body: BODY_PATTERN.map((id) => ({
      id,
      description: BODY_DESCRIPTIONS[id] ?? id,
    })),
    eye: CORNER_EYE_PATTERNS.map((id) => ({
      id,
      description: EYE_DESCRIPTIONS[id] ?? id,
    })),
    dot: CORNER_EYE_DOT_PATTERNS.map((id) => ({
      id,
      description: DOT_DESCRIPTIONS[id] ?? id,
    })),
    // Frames drawn as templates (`template`): the whole artwork is `size`
    // wide, the code smaller inside it; "default" draws none
    templates: getAllTemplates().map(({ id, name }) => ({
      id,
      name: id === "default" ? "None" : name,
      description:
        id === "default"
          ? "No frame"
          : `The ${name} frame, drawn at the template's size: the whole artwork is size wide`,
    })),
    levels: [
      { id: "L", recovery: "~7%" },
      { id: "M", recovery: "~15%" },
      { id: "Q", recovery: "~25%" },
      { id: "H", recovery: "~30%" },
    ],
    defaults: QR_DEFAULTS,
    limits: {
      dataMaxLength: QR_DATA_MAX_LENGTH,
      sizeMin: QR_SIZE_MIN,
      sizeMax: QR_SIZE_MAX,
      marginMax: QR_MARGIN_MAX,
    },
  };
}

function toQrProps(options: QrOptions) {
  return {
    value: options.data,
    size: options.size,
    level: options.level,
    fgColor: toHex(options.fg),
    bgColor: toHex(options.bg),
    eyeColor: options.eyeColor ? toHex(options.eyeColor) : undefined,
    dotColor: options.dotColor ? toHex(options.dotColor) : undefined,
    bodyPattern: options.body,
    cornerEyePattern: options.eye,
    cornerEyeDotPattern: options.dot,
    margin: options.margin,
    templateId: options.template,
    // A Swiss QR-bill is encoded at exactly its level (IG §6.1)
    ...payloadEngineOptions(options.data),
  };
}

/** Renders the QR code to an SVG document string. */
export function renderQrSvg(options: QrOptions): string {
  try {
    return serializeNode(createElement(QRCodeSVG, toQrProps(options)));
  } catch (error) {
    if (error instanceof RangeError && error.message === "Data too long") {
      throw new QrDataTooLongError(options.level);
    }
    throw error;
  }
}

/** Renders the QR code to PNG bytes (rasterized from the same SVG). */
export async function renderQrPng(options: QrOptions): Promise<ArrayBuffer> {
  const svg = renderQrSvg(options);
  return rasterizeImage(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    options.size,
  );
}

/**
 * Renders the QR code in a format converted from the same PNG, such as
 * lossless WebP, BMP or an ICO favicon (lib/qr-image-formats.ts).
 */
export async function renderQrImage(
  options: QrOptions,
  format: ConvertedFormat,
): Promise<Uint8Array> {
  // An ICO is scaled down from one big render: the request's size doesn't apply.
  const drawn =
    format === "ico" ? { ...options, size: ICO_MASTER_SIZE } : options;
  return await convertPng(await renderQrPng(drawn), format, options.data);
}

/**
 * SVG markup of any qrdx element tree, for renders the options above don't
 * cover (AI art blends a picture into the modules with `art`).
 */
export function serializeQrSvg(element: ReactElement): string {
  return serializeNode(element);
}

const SVG_DATA_URL = "data:image/svg+xml;base64,";

/**
 * An SVG data URL with its text (frame labels) drawn as glyph outlines: the
 * rasterizer has no fonts on the server and drew boxes for every letter
 * (lib/qr-text-outline.ts). Anything without text comes back unchanged.
 */
async function withOutlinedText(src: string): Promise<string> {
  if (!src.startsWith(SVG_DATA_URL)) return src;
  const svg = Buffer.from(src.slice(SVG_DATA_URL.length), "base64").toString();
  if (!svg.includes("<text")) return src;
  const outlined = await outlineSvgText(svg);
  return `${SVG_DATA_URL}${Buffer.from(outlined).toString("base64")}`;
}

/**
 * Draws an image (an SVG, PNG or JPEG data URL) onto a `width` × `height`
 * canvas (square by default), stretched to fill it, and returns PNG bytes.
 * An SVG's text is drawn from Geist's glyph outlines.
 */
export async function rasterizeImage(
  src: string,
  width: number,
  height = width,
): Promise<ArrayBuffer> {
  const image = new ImageResponse(
    createElement(
      "div",
      { style: { display: "flex", width: "100%", height: "100%" } },
      createElement("img", {
        alt: "",
        height,
        src: await withOutlinedText(src),
        width,
      }),
    ),
    { width, height },
  );
  return image.arrayBuffer();
}

/**
 * Renders the QR code as vector EPS (PostScript), `size` points wide
 * (72 points per inch), converted from the same SVG.
 */
export async function renderQrEps(options: QrOptions): Promise<string> {
  return await svgToEPS(renderQrSvg(options), { width: options.size });
}

// ── React element tree → SVG markup ────────────────────────────────────────
// A small static serializer for the library's SVG output. It avoids
// react-dom/server, which is not available to route handlers in the React
// Server Components layer. Attribute aliases follow react-dom's SVG mapping.

const ATTRIBUTE_ALIASES: Record<string, string> = {
  className: "class",
  alignmentBaseline: "alignment-baseline",
  baselineShift: "baseline-shift",
  clipPath: "clip-path",
  clipRule: "clip-rule",
  colorInterpolation: "color-interpolation",
  colorInterpolationFilters: "color-interpolation-filters",
  dominantBaseline: "dominant-baseline",
  fillOpacity: "fill-opacity",
  fillRule: "fill-rule",
  floodColor: "flood-color",
  floodOpacity: "flood-opacity",
  fontFamily: "font-family",
  fontSize: "font-size",
  fontStyle: "font-style",
  fontWeight: "font-weight",
  imageRendering: "image-rendering",
  letterSpacing: "letter-spacing",
  lightingColor: "lighting-color",
  markerEnd: "marker-end",
  markerMid: "marker-mid",
  markerStart: "marker-start",
  paintOrder: "paint-order",
  pointerEvents: "pointer-events",
  shapeRendering: "shape-rendering",
  stopColor: "stop-color",
  stopOpacity: "stop-opacity",
  strokeDasharray: "stroke-dasharray",
  strokeDashoffset: "stroke-dashoffset",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeMiterlimit: "stroke-miterlimit",
  strokeOpacity: "stroke-opacity",
  strokeWidth: "stroke-width",
  textAnchor: "text-anchor",
  textDecoration: "text-decoration",
  textRendering: "text-rendering",
  transformOrigin: "transform-origin",
  vectorEffect: "vector-effect",
  wordSpacing: "word-spacing",
  writingMode: "writing-mode",
  xlinkHref: "xlink:href",
  xmlLang: "xml:lang",
  xmlSpace: "xml:space",
  xmlnsXlink: "xmlns:xlink",
};

const UNITLESS_STYLES = new Set([
  "fillOpacity",
  "flex",
  "flexGrow",
  "flexShrink",
  "fontWeight",
  "lineHeight",
  "opacity",
  "order",
  "stopOpacity",
  "strokeMiterlimit",
  "strokeOpacity",
  "zIndex",
]);

const SKIPPED_PROPS = new Set([
  "children",
  "dangerouslySetInnerHTML",
  "ref",
  "suppressHydrationWarning",
]);

const MEMO_TYPE = Symbol.for("react.memo");
const FORWARD_REF_TYPE = Symbol.for("react.forward_ref");

type ElementProps = Record<string, unknown> & {
  children?: ReactNode;
  dangerouslySetInnerHTML?: { __html?: string };
};

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', "&quot;");
}

function serializeStyle(style: Record<string, unknown>): string {
  const declarations: string[] = [];
  for (const [key, value] of Object.entries(style)) {
    if (value === null || value === undefined || value === "") continue;
    if (typeof value === "boolean") continue;
    const name = key.startsWith("--")
      ? key
      : key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
    const css =
      typeof value === "number" && value !== 0 && !UNITLESS_STYLES.has(key)
        ? `${value}px`
        : String(value);
    declarations.push(`${name}:${css}`);
  }
  return declarations.join(";");
}

function serializeAttributes(props: ElementProps): string {
  let attributes = "";
  for (const [key, value] of Object.entries(props)) {
    if (SKIPPED_PROPS.has(key) || value === null || value === undefined) {
      continue;
    }
    if (typeof value === "function" || typeof value === "symbol") continue;

    if (key === "style") {
      const css =
        typeof value === "object"
          ? serializeStyle(value as Record<string, unknown>)
          : String(value);
      if (css) attributes += ` style="${escapeAttribute(css)}"`;
      continue;
    }

    const name = ATTRIBUTE_ALIASES[key] ?? key;
    if (typeof value === "boolean") {
      if (name.startsWith("aria-") || name.startsWith("data-")) {
        attributes += ` ${name}="${value}"`;
      }
      continue;
    }
    attributes += ` ${name}="${escapeAttribute(String(value))}"`;
  }
  return attributes;
}

function serializeNode(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string") return escapeText(node);
  if (typeof node === "number" || typeof node === "bigint") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(serializeNode).join("");
  if (!isValidElement(node)) {
    throw new TypeError("Unsupported node in QR SVG output");
  }

  const props = node.props as ElementProps;
  const type = node.type as unknown;

  if (type === Fragment) return serializeNode(props.children);

  if (typeof type === "function") {
    if (
      (type as { prototype?: { isReactComponent?: unknown } }).prototype
        ?.isReactComponent
    ) {
      throw new TypeError("Class components are not supported");
    }
    return serializeNode((type as (p: ElementProps) => ReactNode)(props));
  }

  if (typeof type === "object" && type !== null) {
    const exotic = type as {
      $$typeof?: symbol;
      type?: unknown;
      render?: (p: ElementProps, ref: null) => ReactNode;
    };
    if (exotic.$$typeof === MEMO_TYPE) {
      return serializeNode(
        createElement(exotic.type as (p: ElementProps) => ReactNode, props),
      );
    }
    if (exotic.$$typeof === FORWARD_REF_TYPE && exotic.render) {
      return serializeNode(exotic.render(props, null));
    }
  }

  if (typeof type !== "string") {
    throw new TypeError("Unsupported element type in QR SVG output");
  }

  const attributes = serializeAttributes(props);
  const inner =
    props.dangerouslySetInnerHTML?.__html ?? serializeNode(props.children);
  return inner
    ? `<${type}${attributes}>${inner}</${type}>`
    : `<${type}${attributes}/>`;
}
