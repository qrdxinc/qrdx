// Swiss QR-bill payment codes: the "Swiss QR Code" of SIX's Swiss
// Implementation Guidelines for the QR-bill (v2.4, valid from 14 Nov 2026;
// the payload is the same as v2.3's). Plain lines of text, joined with LF:
//
//   SPC, 0200, 1, IBAN, creditor (S, name, street, building number,
//   postcode, town, country), 7 empty ultimate-creditor lines, amount,
//   currency, ultimate debtor (7 lines, all empty when there's none),
//   reference type (QRR, SCOR or NON), reference, message, EPD
//   [, billing information]
//
// The 31 lines up to EPD are always there, empty ones included, and there
// is no line break after the last one (IG §4.1.4). Codes are drawn at error
// correction M, 46 × 46 mm, with the Swiss cross in the middle (§6); the
// design side of that is lib/qr-design/swiss-qr-bill-style.ts.

import type { SwissQrBillContent } from "@/types/qr-content";
import { checkIban, isCreditorReference } from "./epc-qr";

/** IG §6.1: "error correction level M". */
export const SWISS_QR_ERROR_CORRECTION = "M";

/** IG §6.2: at most 997 characters; checked in UTF-8 bytes (version 25-M). */
export const SWISS_QR_MAX_BYTES = 997;

/** Field limits from IG Table 8. */
export const SWISS_QR_LIMITS = {
  name: 70,
  street: 70,
  buildingNumber: 16,
  postalCode: 16,
  town: 35,
  /** The message and the billing information together */
  information: 140,
} as const;

export const SWISS_QR_MAX_AMOUNT = 999_999_999.99;

export type SwissQrCurrency = "CHF" | "EUR";

export interface SwissQrAddress {
  name: string;
  street?: string;
  buildingNumber?: string;
  postalCode: string;
  town: string;
  /** ISO 3166-1 alpha-2 */
  country: string;
}

export interface SwissQrBill {
  /** IBAN or QR-IBAN, CH or LI */
  iban: string;
  creditor: SwissQrAddress;
  /** Francs or euros; empty lets the payer enter it */
  amount?: string;
  currency: SwissQrCurrency;
  /** Payable by; all lines stay empty without one */
  debtor?: SwissQrAddress;
  /** A QR reference with a QR-IBAN, an RF creditor reference with an IBAN */
  reference?: string;
  /** Unstructured message */
  message?: string;
  /** Structured billing information (//S1/…) */
  billingInfo?: string;
}

export interface SwissQrIssue {
  field?: string;
  message: string;
}

const issue = (field: string, message: string): SwissQrIssue => ({
  field,
  message,
});

// ─── Character set (IG §4.1.1) ──────────────────────────────────────────────

/**
 * Basic Latin, Latin-1 Supplement, Latin Extended-A, Ș ș Ț ț and €.
 */
const SWISS_QR_TEXT = /^[\u0020-\u007E\u00A0-\u017F\u0218-\u021B\u20AC]*$/;

/**
 * Typed text as a payload value: the typographic quotes, dashes and the
 * ellipsis people paste become their plain forms, line breaks spaces.
 */
export function swissQrText(value: string | undefined): string {
  return (value ?? "")
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** The first character a Swiss QR-bill can't carry, if any. */
function badCharacter(value: string): string | null {
  if (SWISS_QR_TEXT.test(value)) return null;
  for (const char of value) {
    if (!SWISS_QR_TEXT.test(char)) return char;
  }
  return null;
}

// ─── Accounts and references ────────────────────────────────────────────────

/** "CH44 3199 9123 0008 8901 2" → "CH4431999123000889012". */
export const normalizeSwissIban = (raw: string) =>
  raw.replace(/\s+/g, "").toUpperCase();

/** IG §2.8: a QR-IBAN's institution ID (positions 5-9) is 30000 to 31999. */
export function isQrIban(raw: string): boolean {
  const iid = Number(normalizeSwissIban(raw).slice(4, 9));
  return iid >= 30_000 && iid <= 31_999;
}

/** IG Annex B: the modulo 10 recursive table. */
const MOD10_TABLE = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];

/** The check digit for the first 26 digits of a QR reference. */
export function qrReferenceCheckDigit(digits: string): number {
  let carry = 0;
  for (const digit of digits) {
    carry = MOD10_TABLE[(carry + Number(digit)) % 10] as number;
  }
  return (10 - carry) % 10;
}

/** "21 00000 00003 13947 14300 09017" → "210000000003139471430009017". */
export const normalizeSwissReference = (raw: string) =>
  raw.replace(/\s+/g, "").toUpperCase();

/** IG §2.12.1: 27 digits, the last a mod-10 recursive check digit, not all zeros. */
export function isQrReference(raw: string): boolean {
  const reference = normalizeSwissReference(raw);
  return (
    /^\d{27}$/.test(reference) &&
    !/^0+$/.test(reference) &&
    qrReferenceCheckDigit(reference.slice(0, 26)) === Number(reference[26])
  );
}

export type SwissReferenceType = "QRR" | "SCOR" | "NON";

/**
 * The reference type a bill takes (IG §7.1): a QR-IBAN always carries a QR
 * reference; an IBAN an RF creditor reference, or none.
 */
export function swissReferenceType(
  iban: string,
  reference: string | undefined,
): SwissReferenceType {
  if (isQrIban(iban)) return "QRR";
  return reference?.trim() ? "SCOR" : "NON";
}

// ─── Amounts ────────────────────────────────────────────────────────────────

/** "1949.7" or "1949,70" → "1949.70"; null when it isn't an amount. */
export function swissQrAmount(raw: string | undefined): string | null {
  let value = raw?.trim() ?? "";
  if (/^\d+,\d{1,2}$/.test(value)) value = value.replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const amount = Number(value);
  if (amount < 0.01 || amount > SWISS_QR_MAX_AMOUNT) return null;
  const [whole = "", fraction = ""] = value.split(".");
  return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(2, "0")}`;
}

// ─── Checks ─────────────────────────────────────────────────────────────────

const REGION_NAMES = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

/** An ISO 3166-1 alpha-2 country code. */
export function isCountryCode(raw: string): boolean {
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return false;
  if (!REGION_NAMES) return true;
  try {
    return REGION_NAMES.of(code) !== code;
  } catch {
    return false;
  }
}

function addressIssue(
  address: Partial<SwissQrAddress>,
  prefix: "" | "debtor",
  who: "creditor" | "payer",
): SwissQrIssue | null {
  const field = (name: string) =>
    prefix ? `${prefix}${name[0]?.toUpperCase()}${name.slice(1)}` : name;
  const checks: [keyof SwissQrAddress, string, number, boolean][] = [
    ["name", "Name", SWISS_QR_LIMITS.name, true],
    ["street", "Street", SWISS_QR_LIMITS.street, false],
    [
      "buildingNumber",
      "Building number",
      SWISS_QR_LIMITS.buildingNumber,
      false,
    ],
    ["postalCode", "Postcode", SWISS_QR_LIMITS.postalCode, true],
    ["town", "Town", SWISS_QR_LIMITS.town, true],
  ];
  for (const [name, label, limit, required] of checks) {
    const value = swissQrText(address[name]);
    if (!value) {
      if (required) {
        return issue(
          field(name),
          `${label} is required${who === "payer" ? " for the payer" : ""}`,
        );
      }
      continue;
    }
    if ([...value].length > limit) {
      return issue(field(name), `${label}s are at most ${limit} characters`);
    }
    const bad = badCharacter(value);
    if (bad) {
      return issue(
        field(name),
        `QR-bills take Latin letters only: "${bad}" can't be used`,
      );
    }
  }
  if (!isCountryCode(address.country ?? "")) {
    return issue(field("country"), "Enter a 2-letter country code, like CH");
  }
  return null;
}

/** The first problem with a bill, or null when it makes a valid code. */
export function swissQrBillIssue(
  bill: Partial<SwissQrBill>,
): SwissQrIssue | null {
  const iban = normalizeSwissIban(bill.iban ?? "");
  if (!iban) return issue("iban", "IBAN is required");
  if (!/^(CH|LI)/.test(iban)) {
    return issue(
      "iban",
      "QR-bills take a Swiss or Liechtenstein IBAN (CH or LI)",
    );
  }
  const checked = checkIban(iban);
  if (!checked.ok) {
    return issue(
      "iban",
      checked.reason === "checksum"
        ? "This IBAN's check digits don't match. Check it for typos."
        : "Swiss IBANs are 21 characters, like CH44 3199 9123 0008 8901 2",
    );
  }
  const creditor = addressIssue(bill.creditor ?? {}, "", "creditor");
  if (creditor) return creditor;
  if (bill.amount?.trim() && !swissQrAmount(bill.amount)) {
    return issue(
      "amount",
      "Amounts are 0.01 to 999,999,999.99, with up to 2 decimals",
    );
  }
  const currency = bill.currency ?? "CHF";
  if (currency !== "CHF" && currency !== "EUR") {
    return issue("currency", "QR-bills are in CHF or EUR");
  }
  if (bill.debtor) {
    const debtor = addressIssue(bill.debtor, "debtor", "payer");
    if (debtor) return debtor;
  }
  const reference = normalizeSwissReference(bill.reference ?? "");
  if (isQrIban(iban)) {
    if (!reference) {
      return issue(
        "reference",
        "A QR-IBAN needs a QR reference: the 27-digit number from your invoicing",
      );
    }
    if (!isQrReference(reference)) {
      return issue(
        "reference",
        "This QR reference's check digit doesn't match. QR references are 27 digits.",
      );
    }
    if (currency !== "CHF") {
      return issue(
        "currency",
        "Bills to a QR-IBAN are in CHF only. For euros, use your IBAN.",
      );
    }
  } else if (reference) {
    if (/^\d{27}$/.test(reference)) {
      return issue(
        "reference",
        "QR references need a QR-IBAN. With this IBAN, use an RF creditor reference or none.",
      );
    }
    if (!isCreditorReference(reference)) {
      return issue(
        "reference",
        "A creditor reference starts with RF and two check digits, like RF18 5390 0754 7034",
      );
    }
  }
  const message = swissQrText(bill.message);
  const billing = swissQrText(bill.billingInfo);
  for (const [field, value] of [
    ["message", message],
    ["billingInfo", billing],
  ] as const) {
    const bad = badCharacter(value);
    if (bad) {
      return issue(
        field,
        `QR-bills take Latin letters only: "${bad}" can't be used`,
      );
    }
  }
  if (billing && !/^\/\/[A-Za-z0-9]{2}\//.test(billing)) {
    return issue(
      "billingInfo",
      "Billing information starts with // and its 2-character syntax code, like //S1/",
    );
  }
  if ([...message].length + [...billing].length > SWISS_QR_LIMITS.information) {
    return issue(
      billing ? "billingInfo" : "message",
      `The message and billing information hold ${SWISS_QR_LIMITS.information} characters together`,
    );
  }
  const bytes = new TextEncoder().encode(
    buildSwissQrPayload(bill as SwissQrBill),
  ).length;
  if (bytes > SWISS_QR_MAX_BYTES) {
    return issue(
      "message",
      `Swiss QR codes hold at most ${SWISS_QR_MAX_BYTES} bytes (this one is ${bytes}). Shorten the names or the message.`,
    );
  }
  return null;
}

// ─── Payload ────────────────────────────────────────────────────────────────

function addressLines(address: SwissQrAddress | undefined): string[] {
  if (!address) return ["", "", "", "", "", "", ""];
  return [
    "S",
    swissQrText(address.name),
    swissQrText(address.street),
    swissQrText(address.buildingNumber),
    swissQrText(address.postalCode),
    swissQrText(address.town),
    address.country.trim().toUpperCase(),
  ];
}

/**
 * The Swiss QR Code payload, LF-separated, with no line break after the
 * last element. Fields aren't checked here; use swissQrBillIssue first.
 */
export function buildSwissQrPayload(bill: SwissQrBill): string {
  const iban = normalizeSwissIban(bill.iban);
  const type = swissReferenceType(iban, bill.reference);
  const amount = bill.amount?.trim() ? (swissQrAmount(bill.amount) ?? "") : "";
  const lines = [
    "SPC",
    "0200",
    "1",
    iban,
    ...addressLines(bill.creditor),
    // Ultimate creditor: must not be filled in (IG Table 8).
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    amount,
    bill.currency ?? "CHF",
    ...addressLines(bill.debtor),
    type,
    type === "NON" ? "" : normalizeSwissReference(bill.reference ?? ""),
    swissQrText(bill.message),
    "EPD",
  ];
  const billing = swissQrText(bill.billingInfo);
  if (billing) lines.push(billing);
  return lines.join("\n");
}

/**
 * `value` is a Swiss QR-bill payload: QR type SPC, version 0200 (IG §4.2).
 * Such a code is encoded at exactly its level (lib/qr-design/engine-options.ts).
 */
export function isSwissQrPayload(value: string): boolean {
  return /^SPC\r?\n0200\r?\n/.test(value);
}

// ─── The Swiss cross (IG §6.4.2) ────────────────────────────────────────────

/**
 * The 7 × 7 mm recognition mark, drawn from SIX's artwork proportions: a
 * 0.5 mm white border, a 6 mm black square, and a white cross whose bars
 * are 1/6 of the mark wide and 5/9 of it long, centred.
 */
export const SWISS_CROSS_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="126" height="126" viewBox="0 0 126 126"><rect width="126" height="126" fill="#fff"/><rect x="9" y="9" width="108" height="108" fill="#000"/><rect x="52.5" y="28" width="21" height="70" fill="#fff"/><rect x="28" y="52.5" width="70" height="21" fill="#fff"/></svg>';

/** The cross as a logo, in the format an uploaded logo is stored in. */
export const SWISS_CROSS_LOGO = `data:image/svg+xml,${encodeURIComponent(SWISS_CROSS_SVG)}`;

/** Byte-mode capacity at error correction M, versions 1 to 25 (ISO/IEC 18004). */
const BYTE_CAPACITY_M = [
  14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450,
  504, 560, 624, 666, 711, 779, 857, 911, 997,
];

/** Modules across the symbol of a Swiss QR code holding `payload`. */
export function swissQrModules(payload: string): number {
  const bytes = new TextEncoder().encode(payload).length;
  const index = BYTE_CAPACITY_M.findIndex((capacity) => bytes <= capacity);
  const version = index === -1 ? 25 : index + 1;
  return 17 + 4 * version;
}

/**
 * The cross's size as a share of the code's width (what logoOptions.size
 * means): 7/46 of the symbol, which the quiet zone (`margin` modules on
 * each side) makes a little less of the whole.
 */
export function swissCrossShare(payload: string, margin = 0): number {
  const modules = swissQrModules(payload);
  const share = ((7 / 46) * modules) / (modules + 2 * margin);
  return Math.round(share * 1000) / 1000;
}

// ─── The content type ───────────────────────────────────────────────────────

/** The form's flat fields as a bill: the payer only when switched on. */
export function swissBillFromContent(
  content: Partial<SwissQrBillContent>,
): Partial<SwissQrBill> {
  return {
    iban: content.iban,
    creditor: {
      name: content.name ?? "",
      street: content.street,
      buildingNumber: content.buildingNumber,
      postalCode: content.postalCode ?? "",
      town: content.town ?? "",
      country: content.country ?? "",
    },
    amount: content.amount,
    currency: content.currency ?? "CHF",
    ...(content.payableBy && {
      debtor: {
        name: content.debtorName ?? "",
        street: content.debtorStreet,
        buildingNumber: content.debtorBuildingNumber,
        postalCode: content.debtorPostalCode ?? "",
        town: content.debtorTown ?? "",
        country: content.debtorCountry ?? "",
      },
    }),
    reference: content.reference,
    message: content.message,
    billingInfo: content.billingInfo,
  };
}

export function swissQrBillContentIssue(
  content: Partial<SwissQrBillContent>,
): SwissQrIssue | null {
  return swissQrBillIssue(swissBillFromContent(content));
}

/** A Swiss QR-bill code; "" while the content has a problem. */
export function encodeSwissQrBill(content: SwissQrBillContent): string {
  if (swissQrBillContentIssue(content)) return "";
  return buildSwissQrPayload(swissBillFromContent(content) as SwissQrBill);
}
