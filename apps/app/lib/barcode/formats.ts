// The barcode generator's symbologies and the input rules for each: allowed
// characters, lengths and check digits. Pure data and string checks, with no
// renderer: lib/product-facts.ts counts BARCODE_FORMATS, and the page imports
// this module without loading bwip-js (lib/barcode/render.ts does that).

import { CANONICAL_ORIGIN } from "@repo/config";
import {
  hyphenateIsbn,
  hyphenateIsmn,
  isbn10CheckDigit,
  issnCheckDigit,
} from "./publication";

export type BarcodeFormatId =
  | "ean13"
  | "ean8"
  | "upca"
  | "upce"
  | "isbn"
  | "issn"
  | "ismn"
  | "code128"
  | "code39"
  | "code93"
  | "codabar"
  | "itf14"
  | "gs1-128"
  | "gs1-databar"
  | "gs1-databar-expanded"
  | "datamatrix"
  | "pdf417"
  | "aztec";

export interface BarcodeFormat {
  id: BarcodeFormatId;
  label: string;
  /** Linear (1D) codes have bars, a bar height and printed digits. */
  kind: "linear" | "2d";
  /** One line for the format picker */
  summary: string;
  /** A valid value to start from */
  example: string;
  /** What the input takes, shown under the field */
  inputHint: string;
  /**
   * Blank margin in modules (the narrowest bar, or one 2D cell): the
   * symbology's minimum and the default the generator starts with.
   */
  quietZone: { min: number; default: number };
  /** Default bar height in millimetres (linear codes) */
  barHeightMm?: number;
  /** Longest input the field takes, in characters */
  maxLength: number;
  /** BarcodeDetector format names a reader reports for this symbology */
  detectorFormats: readonly string[];
  /**
   * Takes a 2- or 5-digit add-on (EAN-2 or EAN-5) printed right of the bars,
   * written after the number and a space. The hint is for the add-on field.
   */
  addOn?: { hint: string };
  /**
   * ISSN: the 2-digit sequence variant, the barcode's 11th and 12th digits,
   * written after the ISSN and a space (00 when left out).
   */
  variant?: { hint: string };
}

/** Every symbology the generator draws, in picker order. */
export const BARCODE_FORMATS: readonly BarcodeFormat[] = [
  {
    id: "ean13",
    label: "EAN-13",
    kind: "linear",
    summary: "Retail products sold worldwide",
    example: "5901234123457",
    inputHint:
      "12 digits, and the check digit is added, or all 13 to have it checked.",
    quietZone: { min: 11, default: 11 },
    barHeightMm: 23,
    maxLength: 20,
    detectorFormats: ["ean_13"],
  },
  {
    id: "ean8",
    label: "EAN-8",
    kind: "linear",
    summary: "Small retail packs",
    example: "96385074",
    inputHint:
      "7 digits, and the check digit is added, or all 8 to have it checked.",
    quietZone: { min: 7, default: 7 },
    barHeightMm: 18,
    maxLength: 12,
    detectorFormats: ["ean_8"],
  },
  {
    id: "upca",
    label: "UPC-A",
    kind: "linear",
    summary: "Retail products in the US and Canada",
    example: "036000291452",
    inputHint:
      "11 digits, and the check digit is added, or all 12 to have it checked.",
    quietZone: { min: 9, default: 11 },
    barHeightMm: 23,
    maxLength: 16,
    detectorFormats: ["upc_a", "ean_13"],
  },
  {
    id: "upce",
    label: "UPC-E",
    kind: "linear",
    summary: "A UPC-A number shortened for small packs",
    example: "06543217",
    inputHint:
      "6 to 8 digits (number system 0 or 1, six digits, check digit), or a 12-digit UPC-A that can be shortened.",
    quietZone: { min: 9, default: 9 },
    barHeightMm: 23,
    maxLength: 16,
    detectorFormats: ["upc_e"],
  },
  {
    id: "isbn",
    label: "ISBN",
    kind: "linear",
    summary: "Books, with the ISBN printed above the bars",
    example: "978-1-873671-00-9",
    inputHint:
      "An ISBN-13 (leave its check digit off and it's added), or a whole ISBN-10 to convert, with or without hyphens. The hyphens are placed for you.",
    quietZone: { min: 11, default: 11 },
    barHeightMm: 23,
    maxLength: 30,
    detectorFormats: ["ean_13"],
    addOn: {
      hint: "Optional. In the US and Canada, 5 digits for the price: 5 and the US$ price (52499 is $24.99), or 90000 for none.",
    },
  },
  {
    id: "issn",
    label: "ISSN",
    kind: "linear",
    summary: "Magazines, journals and newspapers, with an issue add-on",
    example: "0317-8471 00 05",
    inputHint:
      "The 8-character ISSN (NNNN-NNNC), or its first 7 digits and the check digit is added. A 13-digit 977 number works too.",
    quietZone: { min: 11, default: 11 },
    barHeightMm: 23,
    maxLength: 30,
    detectorFormats: ["ean_13"],
    variant: {
      hint: "2 digits, 00 for the regular edition. Publishers change it for a new price or a special edition.",
    },
    addOn: {
      hint: "Optional: usually the issue number in 2 digits, or 5 digits.",
    },
  },
  {
    id: "ismn",
    label: "ISMN",
    kind: "linear",
    summary: "Printed music: scores, parts and songbooks",
    example: "979-0-3452-4680-5",
    inputHint:
      "An ISMN of 13 digits starting 979-0, or the old 10-character form starting with M, with or without hyphens. Leave the check digit off and it's added.",
    quietZone: { min: 11, default: 11 },
    barHeightMm: 23,
    maxLength: 30,
    detectorFormats: ["ean_13"],
    addOn: {
      hint: "Optional: 2 or 5 digits, if a distributor asks for one.",
    },
  },
  {
    id: "code128",
    label: "Code 128",
    kind: "linear",
    summary: "Letters, digits and symbols: labels, tickets, inventory",
    example: "QRDX-2026-0042",
    inputHint:
      "Up to 80 letters, digits, spaces and keyboard symbols (plain ASCII, no accents or emoji).",
    quietZone: { min: 10, default: 10 },
    barHeightMm: 15,
    maxLength: 80,
    detectorFormats: ["code_128"],
  },
  {
    id: "code39",
    label: "Code 39",
    kind: "linear",
    summary: "Capital letters and digits for older scanners",
    example: "QRDX-39",
    inputHint: "Up to 40 capital letters, digits, spaces and - . $ / + %.",
    quietZone: { min: 10, default: 10 },
    barHeightMm: 15,
    maxLength: 40,
    detectorFormats: ["code_39"],
  },
  {
    id: "code93",
    label: "Code 93",
    kind: "linear",
    summary: "Code 39's characters in a shorter barcode",
    example: "QRDX-93",
    inputHint: "Up to 40 capital letters, digits, spaces and - . $ / + %.",
    quietZone: { min: 10, default: 10 },
    barHeightMm: 15,
    maxLength: 40,
    detectorFormats: ["code_93"],
  },
  {
    id: "codabar",
    label: "Codabar",
    kind: "linear",
    summary: "Digits for libraries, blood banks and older labels",
    example: "A40156B",
    inputHint:
      "Start and end with A, B, C or D; between them up to 38 digits and - $ : / . +.",
    quietZone: { min: 10, default: 10 },
    barHeightMm: 15,
    maxLength: 40,
    detectorFormats: ["codabar"],
  },
  {
    id: "itf14",
    label: "ITF-14",
    kind: "linear",
    summary: "Shipping cartons holding retail products",
    example: "15400141288763",
    inputHint:
      "13 digits, and the check digit is added, or all 14 to have it checked.",
    // The bearer frame BWIPP draws already holds the 10-module quiet zone.
    quietZone: { min: 0, default: 4 },
    barHeightMm: 25,
    maxLength: 20,
    detectorFormats: ["itf"],
  },
  {
    id: "gs1-128",
    label: "GS1-128",
    kind: "linear",
    summary: "Supply chain data: GTIN, batch, dates, weights",
    example: "(01)09501101530003(17)261231(10)AB-123",
    inputHint:
      "Application Identifiers in brackets, each followed by its value, e.g. (01)09501101530003(10)AB-123.",
    quietZone: { min: 10, default: 10 },
    barHeightMm: 15,
    maxLength: 120,
    detectorFormats: ["code_128"],
  },
  {
    id: "gs1-databar",
    label: "GS1 DataBar",
    kind: "linear",
    summary: "A GTIN in a short barcode for small retail items",
    example: "(01)09501101530003",
    inputHint:
      "A GTIN as (01) and its 14 digits, e.g. (01)09501101530003. Leave off the last digit and the check digit is added.",
    // GS1 DataBar needs no quiet zone; the default keeps the printed GTIN,
    // which is wider than the bars, inside the image.
    quietZone: { min: 0, default: 10 },
    barHeightMm: 15,
    maxLength: 24,
    detectorFormats: ["databar_omni"],
  },
  {
    id: "gs1-databar-expanded",
    label: "GS1 DataBar Expanded",
    kind: "linear",
    summary: "GTIN plus weight, price or dates for fresh food",
    example: "(01)09501101530003(17)261231(10)AB-123",
    inputHint:
      "Application Identifiers in brackets, each followed by its value, e.g. (01)09501101530003(17)261231(10)AB-123.",
    quietZone: { min: 0, default: 10 },
    barHeightMm: 15,
    maxLength: 120,
    detectorFormats: ["databar_expanded"],
  },
  {
    id: "datamatrix",
    label: "Data Matrix",
    kind: "2d",
    summary: "Small square 2D code for parts and labels",
    example: CANONICAL_ORIGIN,
    inputHint: "Any text up to 1,000 characters.",
    quietZone: { min: 1, default: 2 },
    maxLength: 1000,
    detectorFormats: ["data_matrix"],
  },
  {
    id: "pdf417",
    label: "PDF417",
    kind: "2d",
    summary: "Stacked 2D code for IDs, boarding passes and documents",
    example: "QRdx PDF417 sample",
    inputHint: "Any text up to 1,000 characters.",
    quietZone: { min: 2, default: 2 },
    maxLength: 1000,
    detectorFormats: ["pdf417"],
  },
  {
    id: "aztec",
    label: "Aztec",
    kind: "2d",
    summary: "2D code that needs no margin: tickets and transport",
    example: "QRdx Aztec sample",
    inputHint: "Any text up to 1,000 characters.",
    quietZone: { min: 0, default: 2 },
    maxLength: 1000,
    detectorFormats: ["aztec"],
  },
];

export const DEFAULT_BARCODE_FORMAT: BarcodeFormatId = "ean13";

export function getBarcodeFormat(id: BarcodeFormatId): BarcodeFormat {
  const format = BARCODE_FORMATS.find((item) => item.id === id);
  if (!format) throw new Error(`Unknown barcode format "${id}"`);
  return format;
}

export function isBarcodeFormatId(value: string): value is BarcodeFormatId {
  return BARCODE_FORMATS.some((format) => format.id === value);
}

/**
 * Why a value can't be drawn, or what was changed, as a stable code and its
 * values. The API sends the English text (`error`, `note`); the generator
 * shows the visitor's language by code (messages: barcodeTool.issues).
 */
export const BARCODE_ISSUE_CODES = [
  "enterDigits",
  "digitsOnly",
  "checkDigitAdded",
  "wrongCheckDigit",
  "wrongLength",
  "upceEnter",
  "upceSystem",
  "upceNoForm",
  "shortenedFromUpca",
  "numberSystemAssumed",
  "upceLength",
  "upceStart",
  "enterText",
  "tooLong",
  "code128Chars",
  "code39Chars",
  "code39Lowercase",
  "code93Chars",
  "code93Lowercase",
  "codabarStartStop",
  "codabarChars",
  "gs1Enter",
  "gs1Start",
  "gs1Brackets",
  "gs1BadAi",
  "gs1NoValue",
  "gs1BadChars",
  "gs1Ai",
  "gs1TooLong",
  "databarGtinOnly",
  "databarTooLong",
  "isbnChars",
  "isbnLength",
  "isbnPrefix",
  "isbnIsIsmn",
  "isbnUnknownRange",
  "isbn10Converted",
  "isbnHyphenated",
  "issnChars",
  "issnLength",
  "issnPrefix",
  "issnParts",
  "issnVariant",
  "issnEanVariant",
  "issnVariantAssumed",
  "issnFromEan",
  "ismnChars",
  "ismnLength",
  "ismnPrefix",
  "ismnConverted",
  "addOnDigits",
  "addOnLength",
  "unknownFormat",
] as const;

export type BarcodeIssueCode = (typeof BARCODE_ISSUE_CODES)[number];

export interface BarcodeIssue {
  code: BarcodeIssueCode;
  values?: Record<string, string | number>;
  /** Characters that aren't allowed, up to six (" " a space, "\n" a line break) */
  chars?: string[];
  /** gs1Ai: the problem (or note) about that AI's value */
  inner?: BarcodeIssue;
}

export type BarcodeInput =
  | {
      ok: true;
      /** What the encoder gets: the full number with its check digit, etc. */
      value: string;
      /** A note about what was added or changed ("Check digit 7 added.") */
      note?: string;
      /** The same, as codes */
      notes?: BarcodeIssue[];
    }
  | { ok: false; error: string; issue: BarcodeIssue };

const digitCount = (n: number | string) =>
  `${n} digit${Number(n) === 1 ? "" : "s"}`;
const charCount = (n: number | string) =>
  `${n} character${Number(n) === 1 ? "" : "s"}`;
const count = (n: number | string) => Number(n).toLocaleString("en-US");
const englishChars = (chars: readonly string[] = []) =>
  chars
    .map((char) =>
      char === " " ? "space" : char.trim() ? char : "a line break",
    )
    .join(" ");

/** The English text of an issue (the API's `error` and `note`). */
export function barcodeIssueText(issue: BarcodeIssue): string {
  const v = issue.values ?? {};
  switch (issue.code) {
    case "enterDigits":
      return `Enter ${v.short} digits, or all ${v.length} with the check digit.`;
    case "digitsOnly":
      return `${v.label} takes digits only.`;
    case "checkDigitAdded":
      return `Check digit ${v.check} added.`;
    case "wrongCheckDigit":
      return `The check digit should be ${v.expected}, not ${v.given}. Check the number, or leave the last digit off and it's worked out for you.`;
    case "wrongLength":
      return `${v.label} needs ${v.short} or ${v.length} digits; this has ${digitCount(v.count ?? 0)}.`;
    case "upceEnter":
      return "Enter 6 to 8 digits, or a 12-digit UPC-A to shorten.";
    case "upceSystem":
      return "Only UPC-A numbers starting with 0 or 1 have a UPC-E form. Use UPC-A instead.";
    case "upceNoForm":
      return "This UPC-A number has no UPC-E form: only numbers with zeros in the right places can be shortened. Use UPC-A instead.";
    case "shortenedFromUpca":
      return `Shortened from UPC-A ${v.upca}.`;
    case "numberSystemAssumed":
      return "Number system 0 assumed.";
    case "upceLength":
      return `UPC-E needs 6, 7 or 8 digits (or a 12-digit UPC-A); this has ${digitCount(v.count ?? 0)}.`;
    case "upceStart":
      return "A UPC-E number starts with number system 0 or 1.";
    case "enterText":
      return "Enter the text to encode.";
    case "tooLong":
      return `${v.label} here takes up to ${count(v.max ?? 0)} characters; this has ${count(v.count ?? 0)}.`;
    case "code128Chars":
      return `Code 128 here takes plain ASCII letters, digits, spaces and symbols. Not allowed: ${englishChars(issue.chars)}`;
    case "code39Chars":
      return `Code 39 takes capital letters, digits, spaces and - . $ / + % only. Not allowed: ${englishChars(issue.chars)}`;
    case "code39Lowercase":
      return "Code 39 has no lowercase letters. Use capitals, or Code 128 for mixed case.";
    case "code93Chars":
      return `Code 93 takes capital letters, digits, spaces and - . $ / + % only. Not allowed: ${englishChars(issue.chars)}`;
    case "code93Lowercase":
      return "Code 93 here has no lowercase letters. Use capitals, or Code 128 for mixed case.";
    case "codabarStartStop":
      return "Codabar starts and ends with A, B, C or D, with at least one character between them, e.g. A40156B.";
    case "codabarChars":
      return `Codabar takes digits and - $ : / . + between its start and stop letters. Not allowed: ${englishChars(issue.chars)}`;
    case "gs1Enter":
      return "Enter Application Identifiers in brackets with their values, e.g. (01)09501101530003.";
    case "gs1Start":
      return "Start with an Application Identifier in brackets, e.g. (01) for a GTIN, then its value.";
    case "gs1Brackets":
      return "Brackets don't line up: write each AI as (digits), followed by its value.";
    case "gs1BadAi":
      return `"(${v.ai})" isn't an Application Identifier: AIs are 2 to 4 digits.`;
    case "gs1NoValue":
      return `AI (${v.ai}) has no value after it.`;
    case "gs1BadChars":
      return `AI (${v.ai}) has characters GS1 doesn't allow: ${englishChars(issue.chars)}`;
    case "gs1Ai":
      return `AI (${v.ai}): ${issue.inner ? barcodeIssueText(issue.inner) : ""}`;
    case "gs1TooLong":
      return `GS1-128 holds up to ${v.max} characters of AIs and data; this has ${v.count}. Split it over two barcodes.`;
    case "databarGtinOnly":
      return "GS1 DataBar holds only a GTIN: (01) and its 14 digits. For dates, a batch or a weight, use GS1 DataBar Expanded or GS1-128.";
    case "databarTooLong":
      return `GS1 DataBar Expanded holds up to ${v.max} digits of AIs and data, and fewer when there are letters; this has ${v.count} characters. Remove an AI or shorten a value.`;
    case "isbnChars":
      return "An ISBN takes digits, hyphens and spaces; an ISBN-10 can end in X.";
    case "isbnLength":
      return `An ISBN has 13 digits, or 10 in the old ISBN-10 form; this has ${digitCount(v.count ?? 0)}.`;
    case "isbnPrefix":
      return "An ISBN-13 starts with 978 or 979.";
    case "isbnIsIsmn":
      return "Numbers starting 979-0 are ISMNs, for printed music. Pick ISMN as the barcode type.";
    case "isbnUnknownRange":
      return "This ISBN isn't in a range the ISBN agencies had given out when this generator was last updated. Check the number, or type it with a hyphen between each of its five parts to print it as written.";
    case "isbn10Converted":
      return `Converted from ISBN-10 ${v.isbn10}.`;
    case "isbnHyphenated":
      return `Hyphens placed by the ISBN ranges: ${v.isbn}.`;
    case "issnChars":
      return "An ISSN takes digits and a hyphen, and its check digit can be X.";
    case "issnLength":
      return `An ISSN has 8 characters (NNNN-NNNC), or 7 digits without the check digit; this has ${charCount(v.count ?? 0)}.`;
    case "issnPrefix":
      return "A 13-digit ISSN barcode number starts with 977.";
    case "issnParts":
      return "Write the ISSN, the 2-digit sequence variant and the add-on, with a space between each: 0317-8471 00 05.";
    case "issnVariant":
      return "The sequence variant is 2 digits: 00 for the regular edition.";
    case "issnEanVariant":
      return `This 977 number already holds sequence variant ${v.variant}. Leave the variant empty, or enter the 8-character ISSN.`;
    case "issnVariantAssumed":
      return "Sequence variant 00 used.";
    case "issnFromEan":
      return `Read from the 977 number: ISSN ${v.issn}, sequence variant ${v.variant}.`;
    case "ismnChars":
      return "An ISMN takes digits, hyphens and spaces, with an M at the start of the old 10-character form.";
    case "ismnLength":
      return `An ISMN has 13 digits starting 979-0, or 10 characters starting with M in the old form; this has ${charCount(v.count ?? 0)}.`;
    case "ismnPrefix":
      return "An ISMN starts with 979-0, or M in the old form. Other numbers starting 978 or 979 are ISBNs: pick ISBN as the barcode type.";
    case "ismnConverted":
      return `Converted from the old form ${v.ismn10}.`;
    case "addOnDigits":
      return "The add-on takes digits only.";
    case "addOnLength":
      return `An add-on has 2 or 5 digits; this has ${digitCount(v.count ?? 0)}.`;
    case "unknownFormat":
      return "Unknown barcode format.";
  }
}

const fail = (issue: BarcodeIssue): BarcodeInput => ({
  ok: false,
  error: barcodeIssueText(issue),
  issue,
});

/** A success with notes: `note` is their English text, joined. */
const done = (value: string, notes: BarcodeIssue[] = []): BarcodeInput =>
  notes.length > 0
    ? { ok: true, value, note: notes.map(barcodeIssueText).join(" "), notes }
    : { ok: true, value };

/**
 * The GS1 check digit (EAN, UPC, ITF-14, GTIN, SSCC): weights 3 and 1
 * alternate from the rightmost digit of `body`, and the check digit brings
 * the sum up to a multiple of 10.
 */
export function gs1CheckDigit(body: string): number {
  if (!/^\d+$/.test(body)) {
    throw new Error("A GS1 check digit needs digits only");
  }
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * A GS1 number of `length` digits: one digit short gets its check digit,
 * the full length has its check digit verified.
 */
function gs1Number(label: string, raw: string, length: number): BarcodeInput {
  const digits = raw.replace(/[\s-]/g, "");
  if (!digits) {
    return fail({
      code: "enterDigits",
      values: { short: length - 1, length },
    });
  }
  if (!/^\d+$/.test(digits)) {
    return fail({ code: "digitsOnly", values: { label } });
  }
  if (digits.length === length - 1) {
    const check = gs1CheckDigit(digits);
    return done(digits + check, [
      { code: "checkDigitAdded", values: { check } },
    ]);
  }
  if (digits.length === length) {
    const expected = gs1CheckDigit(digits.slice(0, -1));
    const given = Number(digits.at(-1));
    if (expected !== given) {
      return fail({ code: "wrongCheckDigit", values: { expected, given } });
    }
    return done(digits);
  }
  return fail({
    code: "wrongLength",
    values: { label, short: length - 1, length, count: digits.length },
  });
}

/** A UPC-E number (number system, six digits, check digit) as its UPC-A. */
export function expandUpce(upce: string): string {
  if (!/^[01]\d{6}\d?$/.test(upce)) {
    throw new Error("UPC-E needs number system 0 or 1 and six digits");
  }
  const ns = upce[0] as string;
  const d = upce.slice(1, 7);
  const last = Number(d[5]);
  let body: string;
  if (last <= 2) body = `${d.slice(0, 2)}${last}0000${d.slice(2, 5)}`;
  else if (last === 3) body = `${d.slice(0, 3)}00000${d.slice(3, 5)}`;
  else if (last === 4) body = `${d.slice(0, 4)}00000${d[4]}`;
  else body = `${d.slice(0, 5)}0000${last}`;
  const upca = ns + body;
  return upca + gs1CheckDigit(upca);
}

/**
 * The UPC-E form of a 12-digit UPC-A, or null when the number has no UPC-E
 * form (only some manufacturer and product numbers can be shortened).
 */
export function compressUpca(upca: string): string | null {
  if (!/^[01]\d{11}$/.test(upca)) return null;
  const ns = upca[0] as string;
  const m = upca.slice(1, 6);
  const p = upca.slice(6, 11);
  const check = upca[11] as string;
  const candidates = [
    // Manufacturer ends in 000, 100 or 200; product 00000-00999
    `${m.slice(0, 2)}${p.slice(2, 5)}${m[2]}`,
    // Manufacturer ends in 00; product 00000-00099
    `${m.slice(0, 3)}${p.slice(3, 5)}3`,
    // Manufacturer ends in 0; product 00000-00009
    `${m.slice(0, 4)}${p[4]}4`,
    // Product 00005-00009
    `${m}${p[4]}`,
  ];
  for (const body of candidates) {
    const upce = `${ns}${body}${check}`;
    if (expandUpce(upce) === upca) return upce;
  }
  return null;
}

function upceInput(raw: string): BarcodeInput {
  const digits = raw.replace(/[\s-]/g, "");
  if (!digits) {
    return fail({ code: "upceEnter" });
  }
  if (!/^\d+$/.test(digits)) {
    return fail({ code: "digitsOnly", values: { label: "UPC-E" } });
  }

  if (digits.length === 11 || digits.length === 12) {
    const upca = gs1Number("UPC-A", digits, 12);
    if (!upca.ok) return upca;
    if (!/^[01]/.test(upca.value)) {
      return fail({ code: "upceSystem" });
    }
    const upce = compressUpca(upca.value);
    if (!upce) {
      return fail({ code: "upceNoForm" });
    }
    return done(upce, [
      { code: "shortenedFromUpca", values: { upca: upca.value } },
    ]);
  }

  let withSystem = digits;
  const notes: BarcodeIssue[] = [];
  if (digits.length === 6) {
    withSystem = `0${digits}`;
    notes.push({ code: "numberSystemAssumed" });
  }
  if (withSystem.length !== 7 && withSystem.length !== 8) {
    return fail({ code: "upceLength", values: { count: digits.length } });
  }
  if (!/^[01]/.test(withSystem)) {
    return fail({ code: "upceStart" });
  }
  const expected = gs1CheckDigit(expandUpce(withSystem).slice(0, 11));
  if (withSystem.length === 7) {
    return done(withSystem + expected, [
      ...notes,
      { code: "checkDigitAdded", values: { check: expected } },
    ]);
  }
  const given = Number(withSystem[7]);
  if (given !== expected) {
    return fail({ code: "wrongCheckDigit", values: { expected, given } });
  }
  return done(withSystem, notes);
}

/** Characters outside `allowed`, each listed once (up to six), for an issue. */
function offending(text: string, allowed: RegExp): string[] {
  const bad = [...new Set([...text].filter((char) => !allowed.test(char)))];
  return bad
    .slice(0, 6)
    .map((char) => (char.trim() || char === " " ? char : "\n"));
}

const CODE128_CHAR = /^[\x20-\x7e]$/;
const CODE39_CHAR = /^[0-9A-Z \-.$/+%]$/;
/** Code 93's data characters are Code 39's 43; its four shift characters aren't typed. */
const CODE93_CHAR = CODE39_CHAR;
const CODABAR_START_STOP = /^[A-D]$/;
const CODABAR_BODY = /^[0-9\-$:/.+]$/;

function textInput(
  format: BarcodeFormat,
  raw: string,
  allowed: {
    chars: RegExp;
    code: "code128Chars" | "code39Chars" | "code93Chars";
  } | null,
): BarcodeInput {
  if (!raw) return fail({ code: "enterText" });
  const length = [...raw].length;
  if (length > format.maxLength) {
    return fail({
      code: "tooLong",
      values: { label: format.label, max: format.maxLength, count: length },
    });
  }
  if (allowed && [...raw].some((char) => !allowed.chars.test(char))) {
    return fail({ code: allowed.code, chars: offending(raw, allowed.chars) });
  }
  return done(raw);
}

/**
 * Codabar: a start and a stop letter (A to D) around digits and - $ : / . +.
 * The letters are part of what the encoder takes and what's printed, so the
 * visitor types them.
 */
function codabarInput(format: BarcodeFormat, raw: string): BarcodeInput {
  if (!raw) return fail({ code: "enterText" });
  const chars = [...raw];
  if (chars.length > format.maxLength) {
    return fail({
      code: "tooLong",
      values: {
        label: format.label,
        max: format.maxLength,
        count: chars.length,
      },
    });
  }
  const first = chars[0] ?? "";
  const last = chars.at(-1) ?? "";
  if (
    chars.length < 3 ||
    !CODABAR_START_STOP.test(first) ||
    !CODABAR_START_STOP.test(last)
  ) {
    return fail({ code: "codabarStartStop" });
  }
  const body = raw.slice(first.length, raw.length - last.length);
  if ([...body].some((char) => !CODABAR_BODY.test(char))) {
    return fail({ code: "codabarChars", chars: offending(body, CODABAR_BODY) });
  }
  return done(raw);
}

/** GS1 Application Identifiers whose value is a fixed-length number with a check digit. */
const GS1_CHECKED_AIS: Record<string, { name: string; length: number }> = {
  "00": { name: "SSCC", length: 18 },
  "01": { name: "GTIN", length: 14 },
  "02": { name: "GTIN", length: 14 },
};

/** GS1's 82-character set for AI values, without the brackets used to mark AIs. */
const GS1_VALUE = /^[!"%&'*+,\-./0-9:;<=>?A-Z_a-z]$/;

/** The GS separator readers put between variable-length GS1 fields. */
const GS = String.fromCharCode(0x1d);

/** A GS1-128 symbol holds at most 48 data characters. */
export const GS1_128_MAX_DATA = 48;

/**
 * A GS1 DataBar Expanded holds at most 74 digits, and fewer when the data
 * has letters; the encoder finds the exact limit (lib/barcode/draw.ts).
 */
export const DATABAR_EXPANDED_MAX_DATA = 74;

/** The most AI and data characters a symbology holds, and its issue. */
interface Gs1Limit {
  max: number;
  code: "gs1TooLong" | "databarTooLong";
}

const GS1_128_LIMIT: Gs1Limit = { max: GS1_128_MAX_DATA, code: "gs1TooLong" };

function gs1Input(raw: string, limit: Gs1Limit = GS1_128_LIMIT): BarcodeInput {
  const text = raw.replace(/\s+/g, "");
  if (!text) {
    return fail({ code: "gs1Enter" });
  }
  if (!text.startsWith("(")) {
    return fail({ code: "gs1Start" });
  }
  const parts: string[] = [];
  const notes: BarcodeIssue[] = [];
  let dataLength = 0;
  const pattern = /\((\d*)\)([^()]*)/y;
  let index = 0;
  while (index < text.length) {
    pattern.lastIndex = index;
    const match = pattern.exec(text);
    if (!match) {
      return fail({ code: "gs1Brackets" });
    }
    index = pattern.lastIndex;
    const ai = match[1] as string;
    let value = match[2] as string;
    if (!/^\d{2,4}$/.test(ai)) {
      return fail({ code: "gs1BadAi", values: { ai } });
    }
    if (!value) return fail({ code: "gs1NoValue", values: { ai } });
    const bad = [...value].filter((char) => !GS1_VALUE.test(char));
    if (bad.length > 0) {
      return fail({
        code: "gs1BadChars",
        values: { ai },
        chars: offending(value, GS1_VALUE),
      });
    }
    const checked = GS1_CHECKED_AIS[ai];
    if (checked) {
      const number = gs1Number(
        `AI (${ai}) (${checked.name})`,
        value,
        checked.length,
      );
      if (!number.ok) {
        return fail({ code: "gs1Ai", values: { ai }, inner: number.issue });
      }
      for (const note of number.notes ?? []) {
        notes.push({ code: "gs1Ai", values: { ai }, inner: note });
      }
      value = number.value;
    }
    parts.push(`(${ai})${value}`);
    dataLength += ai.length + value.length;
  }
  if (dataLength > limit.max) {
    return fail({
      code: limit.code,
      values: { max: limit.max, count: dataLength },
    });
  }
  return done(parts.join(""), notes);
}

/**
 * GS1 DataBar (Omnidirectional) holds a GTIN and nothing else: (01) and 14
 * digits. Checked here because bwip-js only says the data "must be 13 or
 * 14 digits", which reads wrong for (01)…(10)….
 */
function databarInput(raw: string): BarcodeInput {
  const checked = gs1Input(raw, {
    max: Number.POSITIVE_INFINITY,
    code: "gs1TooLong",
  });
  if (!checked.ok) return checked;
  if (!/^\(01\)\d{14}$/.test(checked.value)) {
    return fail({ code: "databarGtinOnly" });
  }
  return checked;
}

/** What may follow an ISBN, ISSN or ISMN in its own field. */
export interface BarcodeInputParts {
  /** 2 or 5 digits printed right of the bars; empty for none */
  addOn?: string;
  /** ISSN only: the 2-digit sequence variant; empty for 00 */
  variant?: string;
}

interface SplitValue {
  main: string;
  addOn: string;
  variant: string;
}

/** Could `text` be the number itself, with or without its check digit? */
const ISBN_SHAPE = (text: string) =>
  /^(?:\d{9}[\dX]|97[89]\d{9,10})$/i.test(text.replace(/[\s-]/g, ""));
const ISMN_SHAPE = (text: string) =>
  /^(?:M\d{8,9}|9790\d{8,9})$/i.test(text.replace(/[\s-]/g, ""));

/**
 * "978-1-873671-00-9 52250" as the number and its add-on. The number may
 * have spaces of its own, so the last group is the add-on only when the
 * rest, and not the whole, has the shape of the number.
 */
function splitTrailingAddOn(
  raw: string,
  isNumber: (text: string) => boolean,
): SplitValue {
  const text = raw.trim();
  const at = text.search(/\s\S+$/);
  if (at > 0) {
    const main = text.slice(0, at).trim();
    if (!isNumber(text) && isNumber(main)) {
      return { main, addOn: text.slice(at).trim(), variant: "" };
    }
  }
  return { main: text, addOn: "", variant: "" };
}

/**
 * "0317-8471 00 05" as the ISSN, its sequence variant and its add-on. One
 * group after the ISSN is the variant (2 digits) or, with 5 digits, the
 * add-on; after a 13-digit 977 number, which holds its variant, it's the
 * add-on.
 */
function splitIssn(raw: string): SplitValue | BarcodeIssue {
  const groups = raw.trim().split(/\s+/).filter(Boolean);
  let main = groups.shift() ?? "";
  // "0317 8471": the ISSN's halves with a space between them
  if (/^\d{4}$/.test(main) && /^\d{3}[\dX]?$/i.test(groups[0] ?? "")) {
    main += groups.shift();
  }
  if (/^\d{12,13}$/.test(main.replace(/-/g, ""))) {
    if (groups.length > 1) return { code: "issnParts" };
    return { main, variant: "", addOn: groups[0] ?? "" };
  }
  if (groups.length > 2) return { code: "issnParts" };
  if (groups.length === 1 && /^\d{5}$/.test(groups[0] as string)) {
    return { main, variant: "", addOn: groups[0] as string };
  }
  return { main, variant: groups[0] ?? "", addOn: groups[1] ?? "" };
}

/**
 * The number, add-on and sequence variant of a value of `id`, for the
 * generator's separate fields; formats without them keep the whole value
 * as `main`.
 */
export function splitBarcodeValue(id: BarcodeFormatId, value: string) {
  if (id === "isbn") return splitTrailingAddOn(value, ISBN_SHAPE);
  if (id === "ismn") return splitTrailingAddOn(value, ISMN_SHAPE);
  if (id === "issn") {
    const split = splitIssn(value);
    if ("main" in split) return split;
  }
  return { main: value, addOn: "", variant: "" };
}

/**
 * The EAN-13 a checked ISBN, ISSN or ISMN value is drawn as (what readers
 * decode), or null for other formats.
 */
export function publicationEan13(
  id: BarcodeFormatId,
  value: string,
): string | null {
  if (id === "isbn" || id === "ismn") {
    return (value.split(" ")[0] as string).replace(/-/g, "");
  }
  if (id === "issn") {
    const match = /^(\d{4})-(\d{3})[\dX] (\d{2})/.exec(value);
    if (!match) return null;
    const body = `977${match[1]}${match[2]}${match[3]}`;
    return body + gs1CheckDigit(body);
  }
  return null;
}

function addOnIssue(addOn: string): BarcodeIssue | null {
  if (!addOn) return null;
  if (!/^\d+$/.test(addOn)) return { code: "addOnDigits" };
  if (addOn.length !== 2 && addOn.length !== 5) {
    return { code: "addOnLength", values: { count: addOn.length } };
  }
  return null;
}

/**
 * The hyphens as typed, when they split an ISBN into all its parts (four,
 * or five with the check digit): the fallback for numbers newer than the
 * ranges. The check digit is `isbn13`'s.
 */
function typedIsbnHyphens(
  text: string,
  isbn13: string,
  isTen: boolean,
): string | null {
  const parts = text.split(/[\s-]+/).filter(Boolean);
  const elements = isTen ? ["978", ...parts] : parts;
  const body =
    elements.length === 5 && (elements[4] as string).length === 1
      ? elements.slice(0, 4)
      : elements;
  if (body.length !== 4 || body.join("") !== isbn13.slice(0, 12)) return null;
  return `${body.join("-")}-${isbn13[12]}`;
}

/**
 * An ISBN-13, or an ISBN-10 turned into one (978, its 9 digits and a new
 * check digit), hyphenated by the ISBN ranges for the text above the bars.
 */
function isbnInput(main: string, addOn: string): BarcodeInput {
  const text = main.trim();
  const compact = text.replace(/[\s-]/g, "").toUpperCase();
  if (!compact) {
    return fail({ code: "enterDigits", values: { short: 12, length: 13 } });
  }
  if (
    !/^\d+X?$/.test(compact) ||
    (compact.endsWith("X") && compact.length !== 10)
  ) {
    return fail({ code: "isbnChars" });
  }
  // An ISBN-10 is taken whole: 9 digits could as well be an ISBN-13 being typed.
  if (![10, 12, 13].includes(compact.length)) {
    return fail({ code: "isbnLength", values: { count: compact.length } });
  }
  const isTen = compact.length === 10;
  const notes: BarcodeIssue[] = [];
  let isbn13: string;
  if (isTen) {
    const body = compact.slice(0, 9);
    const check = isbn10CheckDigit(body);
    const given = compact[9] as string;
    if (given !== check) {
      return fail({
        code: "wrongCheckDigit",
        values: { expected: check, given },
      });
    }
    isbn13 = `978${body}${gs1CheckDigit(`978${body}`)}`;
  } else {
    if (!/^97[89]/.test(compact)) return fail({ code: "isbnPrefix" });
    if (compact.startsWith("9790")) return fail({ code: "isbnIsIsmn" });
    const body = compact.slice(0, 12);
    const check = gs1CheckDigit(body);
    if (compact.length === 13) {
      const given = Number(compact[12]);
      if (given !== check) {
        return fail({
          code: "wrongCheckDigit",
          values: { expected: check, given },
        });
      }
    } else {
      notes.push({ code: "checkDigitAdded", values: { check } });
    }
    isbn13 = body + check;
  }

  const typed = typedIsbnHyphens(text, isbn13, isTen);
  let isbn = hyphenateIsbn(isbn13);
  if (!isbn) {
    // In a range newer than the ones here: print the hyphens as typed.
    if (!typed) return fail({ code: "isbnUnknownRange" });
    isbn = typed;
  } else if (isTen) {
    const body = isbn13.slice(3, 12);
    notes.unshift({
      code: "isbn10Converted",
      values: { isbn10: `${isbn.slice(4, -1)}${isbn10CheckDigit(body)}` },
    });
  } else if (/[\s-]/.test(text) && typed !== isbn) {
    notes.push({ code: "isbnHyphenated", values: { isbn } });
  }

  const addOnProblem = addOnIssue(addOn.trim());
  if (addOnProblem) return fail(addOnProblem);
  return done(addOn.trim() ? `${isbn} ${addOn.trim()}` : isbn, notes);
}

/**
 * An ISSN (or the 977 number of an ISSN barcode), its sequence variant and
 * add-on, as "0317-8471 00 05": what the encoder takes.
 */
function issnInput(
  main: string,
  variantIn: string,
  addOn: string,
): BarcodeInput {
  const compact = main.trim().replace(/[\s-]/g, "").toUpperCase();
  const typedVariant = variantIn.trim();
  if (!compact) {
    return fail({ code: "enterDigits", values: { short: 7, length: 8 } });
  }
  const notes: BarcodeIssue[] = [];
  let issn7: string;
  let variant: string;
  if (/^\d{12,13}$/.test(compact)) {
    if (!compact.startsWith("977")) return fail({ code: "issnPrefix" });
    const body = compact.slice(0, 12);
    const check = gs1CheckDigit(body);
    if (compact.length === 13 && Number(compact[12]) !== check) {
      return fail({
        code: "wrongCheckDigit",
        values: { expected: check, given: Number(compact[12]) },
      });
    }
    issn7 = compact.slice(3, 10);
    variant = compact.slice(10, 12);
    if (typedVariant && typedVariant !== variant) {
      return fail({ code: "issnEanVariant", values: { variant } });
    }
    notes.push({
      code: "issnFromEan",
      values: {
        issn: `${issn7.slice(0, 4)}-${issn7.slice(4)}${issnCheckDigit(issn7)}`,
        variant,
      },
    });
  } else {
    if (!/^\d+X?$/.test(compact)) return fail({ code: "issnChars" });
    if (compact.length !== 7 && compact.length !== 8) {
      return fail({ code: "issnLength", values: { count: compact.length } });
    }
    if (compact.length === 7 && compact.endsWith("X")) {
      return fail({ code: "issnChars" });
    }
    issn7 = compact.slice(0, 7);
    const check = issnCheckDigit(issn7);
    const given = compact[7];
    if (given !== undefined && given !== check) {
      return fail({
        code: "wrongCheckDigit",
        values: { expected: check, given },
      });
    }
    if (given === undefined) {
      notes.push({ code: "checkDigitAdded", values: { check } });
    }
    if (!typedVariant) {
      variant = "00";
      notes.push({ code: "issnVariantAssumed" });
    } else if (/^\d{2}$/.test(typedVariant)) {
      variant = typedVariant;
    } else {
      return fail({ code: "issnVariant" });
    }
  }

  const addOnProblem = addOnIssue(addOn.trim());
  if (addOnProblem) return fail(addOnProblem);
  const issn = `${issn7.slice(0, 4)}-${issn7.slice(4)}${issnCheckDigit(issn7)}`;
  return done(
    `${issn} ${variant}${addOn.trim() ? ` ${addOn.trim()}` : ""}`,
    notes,
  );
}

/**
 * An ISMN (979-0 and 9 digits), or the old form (M and 9 characters) turned
 * into one: M becomes 979-0 and the check digit stays the same.
 */
function ismnInput(main: string, addOn: string): BarcodeInput {
  const compact = main.trim().replace(/[\s-]/g, "").toUpperCase();
  if (!compact) {
    return fail({ code: "enterDigits", values: { short: 12, length: 13 } });
  }
  if (!/^M?\d+$/.test(compact)) return fail({ code: "ismnChars" });
  const old = compact.startsWith("M");
  if (
    old
      ? compact.length < 9 || compact.length > 10
      : compact.length < 12 || compact.length > 13
  ) {
    return fail({ code: "ismnLength", values: { count: compact.length } });
  }
  if (!(old || compact.startsWith("9790"))) {
    return fail({ code: "ismnPrefix" });
  }
  const body = old ? `9790${compact.slice(1, 9)}` : compact.slice(0, 12);
  const given = old ? compact[9] : compact[12];
  const check = gs1CheckDigit(body);
  const notes: BarcodeIssue[] = [];
  if (given !== undefined && Number(given) !== check) {
    return fail({
      code: "wrongCheckDigit",
      values: { expected: check, given: Number(given) },
    });
  }
  if (given === undefined) {
    notes.push({ code: "checkDigitAdded", values: { check } });
  }
  const ismn = hyphenateIsmn(body + check);
  if (old) {
    notes.unshift({
      code: "ismnConverted",
      values: { ismn10: `M-${ismn.slice(6)}` },
    });
  }

  const addOnProblem = addOnIssue(addOn.trim());
  if (addOnProblem) return fail(addOnProblem);
  return done(addOn.trim() ? `${ismn} ${addOn.trim()}` : ismn, notes);
}

/**
 * Checks `raw` for `format`; on success, the value the encoder draws. For
 * ISBN, ISSN and ISMN, `raw` holds the add-on (and an ISSN's variant) after
 * the number, unless the generator passes them in `parts` from their own
 * fields.
 */
export function validateBarcodeInput(
  id: BarcodeFormatId,
  raw: string,
  parts?: BarcodeInputParts,
): BarcodeInput {
  const format = getBarcodeFormat(id);
  switch (id) {
    case "isbn": {
      const split = parts
        ? { main: raw, addOn: parts.addOn ?? "" }
        : splitTrailingAddOn(raw, ISBN_SHAPE);
      return isbnInput(split.main, split.addOn);
    }
    case "ismn": {
      const split = parts
        ? { main: raw, addOn: parts.addOn ?? "" }
        : splitTrailingAddOn(raw, ISMN_SHAPE);
      return ismnInput(split.main, split.addOn);
    }
    case "issn": {
      if (parts) {
        return issnInput(raw, parts.variant ?? "", parts.addOn ?? "");
      }
      const split = splitIssn(raw);
      return "main" in split
        ? issnInput(split.main, split.variant, split.addOn)
        : fail(split);
    }
    case "ean13":
      return gs1Number("EAN-13", raw, 13);
    case "ean8":
      return gs1Number("EAN-8", raw, 8);
    case "upca":
      return gs1Number("UPC-A", raw, 12);
    case "upce":
      return upceInput(raw);
    case "itf14":
      return gs1Number("ITF-14", raw, 14);
    case "code128":
      return textInput(format, raw, {
        chars: CODE128_CHAR,
        code: "code128Chars",
      });
    case "code39": {
      const onlyCaseIsWrong =
        /[a-z]/.test(raw) &&
        [...raw.toUpperCase()].every((char) => CODE39_CHAR.test(char));
      if (onlyCaseIsWrong) {
        return fail({ code: "code39Lowercase" });
      }
      return textInput(format, raw, {
        chars: CODE39_CHAR,
        code: "code39Chars",
      });
    }
    case "code93": {
      const onlyCaseIsWrong =
        /[a-z]/.test(raw) &&
        [...raw.toUpperCase()].every((char) => CODE93_CHAR.test(char));
      if (onlyCaseIsWrong) {
        return fail({ code: "code93Lowercase" });
      }
      return textInput(format, raw, {
        chars: CODE93_CHAR,
        code: "code93Chars",
      });
    }
    case "codabar":
      return codabarInput(format, raw);
    case "gs1-128":
      return gs1Input(raw);
    case "gs1-databar":
      return databarInput(raw);
    case "gs1-databar-expanded":
      return gs1Input(raw, {
        max: DATABAR_EXPANDED_MAX_DATA,
        code: "databarTooLong",
      });
    case "datamatrix":
    case "pdf417":
    case "aztec":
      return textInput(format, raw, null);
    default:
      return fail({ code: "unknownFormat" });
  }
}

/**
 * True when what a reader decoded is the value the generator drew. Readers
 * differ in how they report some symbologies: a UPC-A may come back as the
 * 13-digit EAN with a leading 0, a UPC-E as its expanded UPC-A (12 or 13
 * digits), GS1-128 with or without brackets around the AIs and with GS
 * (0x1D) separators between fields, and an ISBN, ISSN or ISMN as its EAN-13
 * digits, with or without the add-on.
 */
export function decodedMatches(
  id: BarcodeFormatId,
  value: string,
  decoded: string,
): boolean {
  switch (id) {
    case "isbn":
    case "issn":
    case "ismn": {
      // Readers that read add-ons report them after the EAN-13.
      const ean = publicationEan13(id, value);
      const { addOn } = splitBarcodeValue(id, value);
      return (
        decoded === ean ||
        (addOn !== "" &&
          (decoded === `${ean} ${addOn}` || decoded === `${ean}${addOn}`))
      );
    }
    case "upca":
      return decoded === value || decoded === `0${value}`;
    case "upce": {
      const upca = expandUpce(value);
      return decoded === value || decoded === upca || decoded === `0${upca}`;
    }
    case "gs1-128":
    case "gs1-databar":
    case "gs1-databar-expanded": {
      // Readers may prefix a symbology identifier: ]C1 (GS1-128), ]e0 (DataBar).
      const plain = (text: string) =>
        text
          .replace(/^\](?:C1|e0)/, "")
          .replace(/[()]/g, "")
          .replaceAll(GS, "");
      return plain(decoded) === plain(value);
    }
    default:
      return decoded === value;
  }
}
