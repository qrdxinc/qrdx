// Image addresses on QRdx's keyless image API (GET https://api.qrdx.dev/v1/qr,
// apps/docs/content/docs/developers/image-api.mdx), the =IMAGE() formulas
// that load them in Sheets, and the sizes codes are placed at.
// apps/app/tests/plugins/google-workspace.test.ts checks every preset here
// against the API's own query schema.
//
// Plain JavaScript with no imports, like payload.js.

const QR_IMAGE_API = "https://api.qrdx.dev/v1/qr";

/**
 * A few looks the image API draws from flat parameters, each checked to
 * decode with zbar at 96 px. Dark on light only: these codes get printed.
 */
const STYLE_PRESETS = [
  {
    id: "classic",
    label: "Classic (round dots)",
    params: { body: "circle", eye: "gear", dot: "circle" },
  },
  {
    id: "plain",
    label: "Plain squares",
    params: {},
  },
  {
    id: "blue",
    label: "Blue, rounded",
    params: {
      fg: "0051ff",
      body: "rounded",
      eye: "extra-rounded",
      dot: "rounded",
    },
  },
  {
    id: "slate",
    label: "Slate with blue corners",
    params: {
      fg: "0f172a",
      bg: "f8fafc",
      eyeColor: "3b82f6",
      dotColor: "3b82f6",
      body: "rounded",
      eye: "rounded",
      dot: "rounded",
    },
  },
  {
    id: "green",
    label: "Green",
    params: {
      fg: "166534",
      bg: "f0fdf4",
      eyeColor: "15803d",
      dotColor: "16a34a",
      body: "rounded",
      eye: "circle",
      dot: "circle",
    },
  },
  {
    id: "coffee",
    label: "Coffee",
    params: {
      fg: "78350f",
      bg: "fef3c7",
      eyeColor: "92400e",
      dotColor: "a16207",
      body: "rounded",
      eye: "rounded",
      dot: "rounded",
    },
  },
];

/** The parameters a preset sets, in the order they go in the address. */
const PRESET_PARAM_ORDER = [
  "fg",
  "bg",
  "eyeColor",
  "dotColor",
  "body",
  "eye",
  "dot",
];

/** How big a code is placed in a document, slide or cell. */
const CODE_SIZES = [
  { id: "small", label: "Small (1 in, 2.5 cm)", inches: 1 },
  { id: "medium", label: "Medium (1.5 in, 3.8 cm)", inches: 1.5 },
  { id: "large", label: "Large (2 in, 5 cm)", inches: 2 },
];

/** The image API's smallest and largest image, in pixels. */
const QR_IMAGE_MIN_PIXELS = 64;
const QR_IMAGE_MAX_PIXELS = 2048;

/** At most this many rows get =IMAGE() formulas in one go. */
const FORMULA_MAX_ROWS = 500;

function presetById(id) {
  return STYLE_PRESETS.find((preset) => preset.id === id) ?? STYLE_PRESETS[0];
}

function sizeById(id) {
  return CODE_SIZES.find((size) => size.id === id) ?? CODE_SIZES[1];
}

/** A whole number of pixels the image API accepts. */
function clampPixels(pixels) {
  const whole = Math.round(Number(pixels) || 0);
  return Math.min(QR_IMAGE_MAX_PIXELS, Math.max(QR_IMAGE_MIN_PIXELS, whole));
}

/**
 * Pixels to ask the API for, for a code placed `inches` wide: enough for
 * 300 dpi print, and never under 512 so it stays sharp when enlarged.
 */
function fetchPixels(inches) {
  return clampPixels(Math.max(512, inches * 300));
}

/**
 * The query string, without `data`, for a PNG in a preset's look: every
 * parameter but `data`, so the formula can append the cell's encoded value.
 */
function imageQuery(presetId, pixels) {
  const { params } = presetById(presetId);
  const parts = ["format=png", `size=${clampPixels(pixels)}`];
  for (const name of PRESET_PARAM_ORDER) {
    if (params[name]) parts.push(`${name}=${encodeURIComponent(params[name])}`);
  }
  return parts.join("&");
}

/** The PNG's address for `data` in a preset's look, `pixels` wide. */
function qrImageUrl(data, presetId, pixels) {
  return `${QR_IMAGE_API}?${imageQuery(presetId, pixels)}&data=${encodeURIComponent(data)}`;
}

/**
 * The longest address UrlFetchApp takes, in characters. Apps Script's quotas
 * list "URL Fetch URL length: 2 kB", and a 2,084-character address failed in
 * the add-on (24 Nov 2026) though the API answers it. Sheets fetches the
 * =IMAGE() formulas' addresses itself, so this is for Preview and Insert.
 */
const FETCH_URL_MAX_LENGTH = 2000;

/** 2084 → "2,084". */
function groupDigits(count) {
  return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * The PNG's address for Preview and Insert: { ok: true, url }, or
 * { ok: false, message } when it's longer than UrlFetchApp takes. Encoding
 * makes it longer than the content: 3 characters for a space or a symbol,
 * 6 to 12 for a character outside ASCII ("é" is %C3%A9).
 */
function fetchableImageUrl(data, presetId, pixels) {
  const url = qrImageUrl(data, presetId, pixels);
  if (url.length <= FETCH_URL_MAX_LENGTH) return { ok: true, url };
  return {
    ok: false,
    message: `This is too long for the add-on: Google limits the image's web address to ${groupDigits(FETCH_URL_MAX_LENGTH)} characters, and this content needs ${groupDigits(url.length)} once encoded. Shorten it, or make a dynamic code on qrdx.dev, which keeps long links short.`,
  };
}

/**
 * A Sheets formula that shows the code for the cell `sourceR1C1` points at
 * (R[0]C[-1] is the cell to the left), blank while that cell is empty.
 * ENCODEURL percent-encodes the cell's text for the address.
 */
function imageFormulaR1C1(sourceR1C1, presetId, pixels) {
  const base = `${QR_IMAGE_API}?${imageQuery(presetId, pixels)}&data=`;
  return `=IF(${sourceR1C1}="","",IMAGE("${base}"&ENCODEURL(${sourceR1C1})))`;
}

/** Column letters for a 1-based column number: 1 → A, 27 → AA. */
function columnLetter(column) {
  let rest = Math.floor(column);
  let letters = "";
  while (rest > 0) {
    const index = (rest - 1) % 26;
    letters = String.fromCharCode(65 + index) + letters;
    rest = Math.floor((rest - 1) / 26);
  }
  return letters;
}

/**
 * How many of the target cells already hold something: a value or a
 * formula. Both are Sheets' 2D arrays for the same range.
 */
function countFilledCells(values, formulas) {
  let filled = 0;
  for (let row = 0; row < values.length; row++) {
    const value = values[row][0];
    const formula = formulas[row]?.[0] ?? "";
    if ((value !== "" && value !== null) || formula !== "") filled++;
  }
  return filled;
}

const TOO_MUCH_CONTENT =
  "That's more than one code can hold. Shorten it, or make a dynamic code on qrdx.dev: its short link fits in a small code.";

/**
 * A sentence for a failed image request. The API answers errors with JSON
 * ({ message, data: { details: [{ param, message }] } }). A problem with
 * `data` is the content not fitting: the API's own message suggests a lower
 * error correction level, which the sidebar doesn't offer, so it gets this
 * add-on's sentence instead.
 */
function apiErrorMessage(status, bodyText) {
  if (status === 429) {
    return "QRdx is getting too many requests from Google's servers right now. Wait a minute and try again.";
  }
  if (status === 400) {
    let param = "";
    try {
      param = String(JSON.parse(bodyText)?.data?.details?.[0]?.param ?? "");
    } catch {
      param = "";
    }
    return param === "data"
      ? TOO_MUCH_CONTENT
      : "QRdx couldn't make this code. Check the content and try again.";
  }
  return `QRdx couldn't make the code (error ${status}). Try again in a moment.`;
}

/**
 * The "make a dynamic code" link. `ref` names this add-on in QRdx's
 * sign-up analytics (apps/app/lib/analytics/handoff-tags.ts, PLUGIN_REFS);
 * the utm_ tags name the campaign.
 */
const DYNAMIC_CODE_URL =
  "https://qrdx.dev/dynamic-qr-code?ref=google-workspace-addon&utm_source=google-workspace&utm_medium=addon&utm_campaign=sidebar";
