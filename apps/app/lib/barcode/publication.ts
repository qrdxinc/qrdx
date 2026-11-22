// Book, serial and printed music numbers (ISBN, ISSN, ISMN): their own check
// digits and where their hyphens go. Each is printed as an EAN-13 in the
// "Bookland" prefixes (978 and 979 for ISBN, 977 for ISSN, 979-0 for ISMN)
// with the number itself above the bars. Pure; lib/barcode/formats.ts turns
// these into the generator's input rules.
//
// Sources: ISBN Users' Manual (International ISBN Agency, 2012) and its range
// message for the hyphens; ISO 3297 and issn.org's "Identification with the
// GTIN 13 barcode" for ISSN; ISMN Users' Manual (International ISMN Agency,
// 2016), section 2.2, for the ISMN registrant ranges.
import { ISBN_RANGES } from "./isbn-ranges.generated";

/** ISBN-10 check digit of 9 digits: weights 10 to 2, modulo 11, X for 10. */
export function isbn10CheckDigit(body: string): string {
  if (!/^\d{9}$/.test(body)) throw new Error("An ISBN-10 body is 9 digits");
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(body[i]) * (10 - i);
  const check = (11 - (sum % 11)) % 11;
  return check === 10 ? "X" : String(check);
}

/** ISSN check digit of 7 digits: weights 8 to 2, modulo 11, X for 10. */
export function issnCheckDigit(body: string): string {
  if (!/^\d{7}$/.test(body)) throw new Error("An ISSN body is 7 digits");
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(body[i]) * (8 - i);
  const check = (11 - (sum % 11)) % 11;
  return check === 10 ? "X" : String(check);
}

interface Range {
  /** Last 7-digit number of the range, as a string (they compare as text) */
  end: string;
  /** Digits in the element the range sets; 0 when not given out */
  length: number;
}

let parsed: Map<string, Range[]> | null = null;

function ranges(prefix: string): Range[] | undefined {
  if (!parsed) {
    parsed = new Map();
    for (const [key, rules] of Object.entries(ISBN_RANGES)) {
      parsed.set(
        key,
        rules.split(",").map((rule) => ({
          end: rule.slice(0, -1).padEnd(7, "9"),
          length: Number(rule.at(-1)),
        })),
      );
    }
  }
  return parsed.get(prefix);
}

/** The length the ranges of `prefix` give the element starting at `seven`. */
function elementLength(prefix: string, seven: string): number {
  const list = ranges(prefix);
  if (!list) return 0;
  return list.find((range) => seven <= range.end)?.length ?? 0;
}

/**
 * An ISBN-13 (13 digits) with its five elements hyphenated, as the ISBN
 * agencies' ranges split it: "978-1-56581-231-4". Null when the number is in
 * a range not given out yet (or the ranges here are older than the number).
 */
export function hyphenateIsbn(isbn: string): string | null {
  if (!/^97[89]\d{10}$/.test(isbn)) return null;
  const prefix = isbn.slice(0, 3);
  const rest = isbn.slice(3, 12);
  const groupLength = elementLength(prefix, rest.slice(0, 7));
  if (!groupLength) return null;
  const group = rest.slice(0, groupLength);
  const afterGroup = rest.slice(groupLength).padEnd(7, "0");
  const registrantLength = elementLength(
    `${prefix}-${group}`,
    afterGroup.slice(0, 7),
  );
  // The publication element needs at least one digit.
  if (!registrantLength || groupLength + registrantLength > 8) return null;
  const registrant = rest.slice(groupLength, groupLength + registrantLength);
  const publication = rest.slice(groupLength + registrantLength);
  return [prefix, group, registrant, publication, isbn[12]].join("-");
}

/**
 * The registrant element's length in an ISMN, from the digit after 979-0:
 * 000-099 (3 digits), 1000-3999 (4), 40000-69999 (5), 700000-899999 (6),
 * 9000000-9999999 (7). The item element has the rest of the 8 digits.
 */
const ISMN_REGISTRANT_LENGTH = [3, 4, 4, 4, 5, 5, 5, 6, 6, 7] as const;

/** An ISMN (13 digits, 9790…) hyphenated: "979-0-2605-3211-3". */
export function hyphenateIsmn(ismn: string): string {
  if (!/^9790\d{9}$/.test(ismn)) throw new Error("An ISMN is 9790 + 9 digits");
  const eight = ismn.slice(4, 12);
  const length = ISMN_REGISTRANT_LENGTH[Number(eight[0])] as number;
  return `979-0-${eight.slice(0, length)}-${eight.slice(length)}-${ismn[12]}`;
}
