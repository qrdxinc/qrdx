import {
  BARCODE_DATA_MAX_LENGTH,
  BARCODE_FILE_TYPES,
  BARCODE_FORMATS,
  type BarcodeFileType,
  type BarcodeFormat,
} from "./constants";

// GET /barcode: the keyless barcode endpoint. Builds its query from the
// node's options and names the file it returns, as qr-image.ts does for
// GET /qr.

/** The node's barcode image options (all optional), by parameter name. */
export interface BarcodeImageOptions {
  foregroundColor?: string;
  backgroundColor?: string;
  scale?: number;
  barHeight?: number;
  quietZone?: number;
  showText?: boolean;
  rotation?: string;
  fileName?: string;
  baseUrl?: string;
}

/** Option → query parameter of GET /barcode. */
const QUERY_NAMES = {
  foregroundColor: "fg",
  backgroundColor: "bg",
  scale: "scale",
  barHeight: "height",
  quietZone: "quietZone",
  showText: "text",
  rotation: "rotate",
} as const satisfies Partial<Record<keyof BarcodeImageOptions, string>>;

const COLOR_OPTIONS = new Set<keyof BarcodeImageOptions>([
  "foregroundColor",
  "backgroundColor",
]);

// The barcode API takes #rgb or #rrggbb, with or without the #.
const HEX_COLOR = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export const isBarcodeFormat = (value: unknown): value is BarcodeFormat =>
  typeof value === "string" &&
  (BARCODE_FORMATS as readonly string[]).includes(value);

export const isBarcodeFileType = (value: unknown): value is BarcodeFileType =>
  typeof value === "string" &&
  (BARCODE_FILE_TYPES as readonly string[]).includes(value);

/** The GET /barcode query for `data` as `format` in a `type` file. */
export function buildBarcodeImageQuery(
  data: string,
  format: BarcodeFormat,
  type: BarcodeFileType,
  options: BarcodeImageOptions = {}
): Record<string, string> {
  if (!data) throw new Error("Enter the number or text to encode.");
  if (data.length > BARCODE_DATA_MAX_LENGTH) {
    throw new Error(
      `The data is ${data.length} characters long; a barcode can hold up to ${BARCODE_DATA_MAX_LENGTH.toLocaleString("en-US")}.`
    );
  }
  const query: Record<string, string> = { format, data, type };
  for (const [option, param] of Object.entries(QUERY_NAMES) as [
    keyof typeof QUERY_NAMES,
    string,
  ][]) {
    const value = options[option];
    if (value === undefined || value === null || value === "") continue;
    if (COLOR_OPTIONS.has(option)) {
      const color = String(value).trim();
      if (!HEX_COLOR.test(color)) {
        throw new Error(
          `"${color}" isn't a hex color. Use a value like #111827.`
        );
      }
      // Hex without `#`, so image URLs stay readable.
      query[param] = color.replace(/^#/, "");
      continue;
    }
    query[param] = String(value);
  }
  return query;
}

/** The image's URL: it renders the same image with no key, so it can go into an <img> tag. */
export function barcodeImageUrl(
  baseUrl: string,
  query: Record<string, string>
): string {
  return `${baseUrl}/barcode?${new URLSearchParams(query).toString()}`;
}

/** What GET /barcode answers with for each file type. */
export const BARCODE_MIME_TYPES: Record<BarcodeFileType, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  eps: "application/postscript",
};

/** File name (with the type's extension) and MIME type of the image. */
export function barcodeImageFile(
  type: BarcodeFileType,
  fileName?: string
): { fileName: string; mimeType: string; fileExtension: string } {
  const name = fileName?.trim() || "barcode";
  const extension = `.${type}`;
  return {
    fileName: name.toLowerCase().endsWith(extension)
      ? name
      : `${name}${extension}`,
    mimeType: BARCODE_MIME_TYPES[type],
    fileExtension: type,
  };
}
