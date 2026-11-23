// Image API URLs and the snippets around them, for the /qr-code-api page and
// its URL builder. Client-safe: no server imports, so the defaults are
// written out here and tests/home/qr-code-api.test.ts checks them against
// the API's own (lib/qr-render.ts).

export type ImageFormat =
  | "svg"
  | "png"
  | "webp"
  | "gif"
  | "bmp"
  | "ico"
  | "tiff"
  | "tiff-cmyk"
  | "eps";

export const LEVELS = ["L", "M", "Q", "H"] as const;

/** What the builder sets; a value equal to the API default is left out. */
export interface ApiQuery {
  data: string;
  format: ImageFormat;
  size: number;
  /** #rrggbb */
  fg: string;
  /** #rrggbb */
  bg: string;
  body: string;
  level: (typeof LEVELS)[number];
  /** A quick icon id, or "none". */
  logoIcon: string;
}

/** The API's defaults (lib/qr-render.ts QR_DEFAULTS). */
export const API_DEFAULTS = {
  format: "svg",
  size: 512,
  fg: "#000000",
  bg: "#ffffff",
  body: "square",
  level: "Q",
} as const;

// `:` and `/` are allowed in a query string, so links stay readable
// (data=https://qrdx.dev); everything else is percent-encoded, parentheses
// too, so the URL can sit inside a Markdown link.
const encode = (value: string) =>
  encodeURIComponent(value)
    .replace(/%3A/gi, ":")
    .replace(/%2F/gi, "/")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");

/** The query string for `query`, defaults left out, data first. */
export function queryString(query: ApiQuery): string {
  const pairs: [string, string][] = [["data", query.data]];
  if (query.format !== API_DEFAULTS.format)
    pairs.push(["format", query.format]);
  if (query.size !== API_DEFAULTS.size)
    pairs.push(["size", String(query.size)]);
  if (query.fg.toLowerCase() !== API_DEFAULTS.fg) {
    pairs.push(["fg", query.fg.replace("#", "").toLowerCase()]);
  }
  if (query.bg.toLowerCase() !== API_DEFAULTS.bg) {
    pairs.push(["bg", query.bg.replace("#", "").toLowerCase()]);
  }
  if (query.body !== API_DEFAULTS.body) pairs.push(["body", query.body]);
  if (query.level !== API_DEFAULTS.level) pairs.push(["level", query.level]);
  if (query.logoIcon && query.logoIcon !== "none") {
    pairs.push(["logoIcon", query.logoIcon]);
  }
  return pairs.map(([key, value]) => `${key}=${encode(value)}`).join("&");
}

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * Formats an <img> can't show (EPS anywhere, TIFF outside Safari): the
 * builder previews them in another format and links the file instead.
 */
const FILE_ONLY: Partial<
  Record<
    ImageFormat,
    { label: string; extension: string; preview: ImageFormat }
  >
> = {
  eps: { label: "EPS", extension: "eps", preview: "svg" },
  tiff: { label: "TIFF", extension: "tif", preview: "png" },
  "tiff-cmyk": { label: "CMYK TIFF", extension: "tif", preview: "png" },
};

/** The format the builder's preview shows `format` as. */
export const previewFormat = (format: ImageFormat): ImageFormat =>
  FILE_ONLY[format]?.preview ?? format;

/** The image URL, and the HTML, Markdown and curl that use it. */
export function apiSnippets(apiBase: string, query: ApiQuery) {
  const url = `${apiBase}/qr?${queryString(query)}`;
  const alt = `QR code for ${query.data}`;
  const file = FILE_ONLY[query.format];
  // An <img> can't show it: link the file instead.
  if (file) {
    return {
      url,
      html: `<a href="${url}" download>Download the QR code (${file.label})</a>`,
      markdown: `[QR code (${file.label})](${url})`,
      curl: `curl -o qr.${file.extension} "${url}"`,
    };
  }
  const shown = Math.min(query.size, 256);
  return {
    url,
    html: `<img src="${url}" width="${shown}" height="${shown}" alt="${escapeAttribute(alt)}" />`,
    markdown: `![${alt.replace(/[[\]]/g, "")}](${url})`,
    curl: `curl -o qr.${query.format} "${url}"`,
  };
}
