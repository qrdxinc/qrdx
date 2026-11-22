// Czech "QR Platba" codes: the Short Payment Descriptor of the Czech
// Banking Association's standard no. 26 (ČBA, version 1.2, 2022):
//
//   SPD*1.0*ACC:<IBAN>[+<BIC>]*AM:<amount>*CC:CZK*RN:<name>*DT:<YYYYMMDD>*
//   PT:IP*MSG:<message>*X-VS:<variable symbol>*X-SS:…*X-KS:…
//
// Keys are upper case and their order is free; values never contain "*"
// (written %2A). Text is written the way the reference generator's default
// writes it: upper case ASCII without diacritics, so the code stays in QR
// alphanumeric mode and every bank reads it. Only the keys every Czech bank
// processes are used (ČBA v1.2, Table 3), plus RN and PT.

import type { CzechSpdContent } from "@/types/qr-content";
import { checkIban, isBic } from "./epc-qr";

export interface CzechSpdIssue {
  field?: string;
  message: string;
}

const issue = (field: string, message: string): CzechSpdIssue => ({
  field,
  message,
});

/** Field limits from ČBA v1.2, Tables 1 and 2. */
export const SPD_LIMITS = {
  name: 35,
  message: 60,
  symbol: 10,
} as const;

/** AM is at most 10 characters: 9 999 999.99. */
export const SPD_MAX_AMOUNT = 9_999_999.99;

/** ČBA v1.2 §5: printed codes use error correction M. */
export const SPD_ERROR_CORRECTION = "M";

// ─── Accounts ───────────────────────────────────────────────────────────────

/** ISO 7064 MOD 97-10 over letters-as-numbers (A=10 … Z=35). */
function mod97(value: string): number {
  let remainder = 0;
  for (const char of value) {
    const digits = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder;
}

/**
 * A Czech account number's check (ČNB decree 169/2011): the weighted sum
 * of its digits is divisible by 11. Prefixes use the last 6 weights.
 */
function czechAccountCheck(digits: string): boolean {
  const weights = [6, 3, 7, 9, 10, 5, 8, 4, 2, 1].slice(10 - digits.length);
  const sum = [...digits].reduce(
    (total, digit, index) => total + Number(digit) * (weights[index] ?? 0),
    0,
  );
  return sum % 11 === 0;
}

const DOMESTIC_ACCOUNT = /^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/;

/**
 * The account as an IBAN: a Czech IBAN as typed, or a domestic number
 * ("19-123/0800", "222885/5500") turned into one: CZ, check digits, the
 * bank code, the prefix (6 digits) and the number (10 digits).
 */
export function czechIban(raw: string): string | null {
  const value = raw.replace(/\s+/g, "").toUpperCase();
  const domestic = DOMESTIC_ACCOUNT.exec(value);
  if (domestic) {
    const [, prefix = "", number = "", bank = ""] = domestic;
    if (prefix && !czechAccountCheck(prefix.padStart(6, "0"))) return null;
    if (!czechAccountCheck(number.padStart(10, "0"))) return null;
    const bban = `${bank}${prefix.padStart(6, "0")}${number.padStart(10, "0")}`;
    const check = String(98 - mod97(`${bban}CZ00`)).padStart(2, "0");
    return `CZ${check}${bban}`;
  }
  const iban = checkIban(value);
  return iban.ok && iban.iban.startsWith("CZ") ? iban.iban : null;
}

// ─── Text ───────────────────────────────────────────────────────────────────

/**
 * A text value as the reference generator writes it by default: accents
 * dropped, upper case, then "*", "+" and "%" percent-encoded (so readers
 * don't take "+" for a space), and anything still outside ASCII
 * percent-encoded as UTF-8 in upper case hex.
 */
export function spdText(value: string | undefined): string {
  const plain = (value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim()
    .toUpperCase();
  let out = "";
  for (const char of plain) {
    if (char === "*" || char === "+" || char === "%") {
      out += `%${char.charCodeAt(0).toString(16).toUpperCase()}`;
    } else if (/^[\x20-\x7e]$/.test(char)) {
      out += char;
    } else {
      for (const byte of new TextEncoder().encode(char)) {
        out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
      }
    }
  }
  return out;
}

/** Characters a value takes up once encoded ("%2A" counts as one). */
const spdLength = (value: string) => value.replace(/%[0-9A-F]{2}/g, "_").length;

// ─── Amounts and dates ──────────────────────────────────────────────────────

/** "480.5" or "480,50" → "480.50"; null when it isn't an amount. */
export function spdAmount(raw: string | undefined): string | null {
  let value = raw?.trim() ?? "";
  if (/^\d+,\d{1,2}$/.test(value)) value = value.replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const amount = Number(value);
  if (amount < 0.01 || amount > SPD_MAX_AMOUNT) return null;
  const [whole = "", fraction = ""] = value.split(".");
  return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(2, "0")}`;
}

/** "2026-12-31" → "20261231"; null when it isn't a real date. */
function spdDate(raw: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const [year, month, day] = [match[1], match[2], match[3]].map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${match[1]}${match[2]}${match[3]}`
    : null;
}

const today = (now: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
};

// ─── Checks and payload ─────────────────────────────────────────────────────

const SYMBOLS = [
  ["variableSymbol", "X-VS", "Variable symbols"],
  ["specificSymbol", "X-SS", "Specific symbols"],
  ["constantSymbol", "X-KS", "Constant symbols"],
] as const;

export function czechSpdIssue(
  content: Partial<CzechSpdContent>,
  now = new Date(),
): CzechSpdIssue | null {
  if (!content.account?.trim()) {
    return issue("account", "Account is required");
  }
  if (!czechIban(content.account)) {
    return issue(
      "account",
      DOMESTIC_ACCOUNT.test(content.account.replace(/\s+/g, ""))
        ? "This account number's check doesn't match. Check it for typos."
        : "Enter a Czech IBAN or an account number like 19-2000145399/0800",
    );
  }
  if (content.bic?.trim() && !isBic(content.bic)) {
    return issue("bic", "A BIC has 8 or 11 letters and digits, like KOMBCZPP");
  }
  if (content.amount?.trim() && !spdAmount(content.amount)) {
    return issue(
      "amount",
      "Amounts are 0.01 to 9,999,999.99 CZK, with up to 2 decimals",
    );
  }
  if (spdLength(spdText(content.name)) > SPD_LIMITS.name) {
    return issue("name", `Names are at most ${SPD_LIMITS.name} characters`);
  }
  if (spdLength(spdText(content.message)) > SPD_LIMITS.message) {
    return issue(
      "message",
      `Messages are at most ${SPD_LIMITS.message} characters`,
    );
  }
  for (const [field, , label] of SYMBOLS) {
    const value = content[field]?.trim();
    if (value && !/^\d{1,10}$/.test(value)) {
      return issue(field, `${label} are up to 10 digits`);
    }
  }
  if (content.dueDate?.trim()) {
    const due = spdDate(content.dueDate);
    if (!due) return issue("dueDate", "Pick a date for the payment");
    if (due < today(now)) {
      return issue("dueDate", "The due date is in the past");
    }
  }
  return null;
}

/** A QR Platba code; "" while the content has a problem. */
export function encodeCzechSpd(content: CzechSpdContent, now?: Date): string {
  if (czechSpdIssue(content, now)) return "";
  const bic = content.bic?.replace(/\s+/g, "").toUpperCase();
  const amount = content.amount?.trim() ? spdAmount(content.amount) : null;
  const attributes: string[] = [
    `ACC:${czechIban(content.account)}${bic ? `+${bic}` : ""}`,
  ];
  if (amount) attributes.push(`AM:${amount}`, "CC:CZK");
  const name = spdText(content.name);
  if (name) attributes.push(`RN:${name}`);
  if (content.dueDate?.trim()) {
    attributes.push(`DT:${spdDate(content.dueDate)}`);
  }
  if (content.instant) attributes.push("PT:IP");
  const message = spdText(content.message);
  if (message) attributes.push(`MSG:${message}`);
  for (const [field, key] of SYMBOLS) {
    const value = content[field]?.trim();
    if (value) attributes.push(`${key}:${value}`);
  }
  return `SPD*1.0*${attributes.join("*")}`;
}
