// MeCard contacts: NTT Docomo's MECARD format, a compact alternative to
// vCard that Android's scanners read (ML Kit lists it next to vCard). One
// line of NAME:value; fields ending with ";;":
//
//   MECARD:N:Doe,John;SOUND:…;TEL:…;EMAIL:…;BDAY:19700310;ADR:…;URL:…;
//   NICKNAME:…;NOTE:…;;
//
// N is "last,first"; BDAY is 8 digits. The reserved characters \ ; : and ,
// are escaped with a backslash inside values (Docomo's spec; ZXing reads
// them back). Pure, so it runs in the browser, on the server and in tests.

import type { MeCardContent } from "@/types/qr-content";

export interface MeCardIssue {
  field?: string;
  message: string;
}

const issue = (field: string, message: string): MeCardIssue => ({
  field,
  message,
});

/** A value with MeCard's reserved characters escaped, on one line. */
export function escapeMeCard(value: string): string {
  return value
    .replace(/\r\n|\r|\n/g, " ")
    .trim()
    .replace(/([\\;:,])/g, "\\$1");
}

/** "1990-03-10" → "19900310"; null when it isn't a real date. */
export function meCardBirthday(raw: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const [year, month, day] = [match[1], match[2], match[3]].map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${match[1]}${match[2]}${match[3]}`;
}

/** Digits and a leading "+": what a phone dials. */
const phoneDigits = (raw: string) =>
  raw
    .trim()
    .replace(/^00/, "+")
    .replace(/[^\d+]/g, "")
    .replace(/(?!^)\+/g, "");

export function meCardIssue(
  content: Partial<MeCardContent>,
  now = new Date(),
): MeCardIssue | null {
  if (!content.firstName?.trim()) {
    return issue("firstName", "First name is required");
  }
  if (content.phone?.trim()) {
    const digits = phoneDigits(content.phone).replace(/^\+/, "").length;
    if (digits < 3 || digits > 15) {
      return issue("phone", "Enter a valid phone number (3-15 digits)");
    }
  }
  if (
    content.email?.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content.email.trim())
  ) {
    return issue("email", "Enter a valid email address");
  }
  if (content.url?.trim()) {
    const url = content.url.trim();
    let parsed: URL | null = null;
    try {
      parsed = new URL(/^[a-z][a-z\d+.-]*:/i.test(url) ? url : `https://${url}`);
    } catch {
      parsed = null;
    }
    if (
      !parsed ||
      !/^https?:$/.test(parsed.protocol) ||
      !parsed.hostname.includes(".")
    ) {
      return issue("url", "Enter a web address, like https://example.com");
    }
  }
  if (content.birthday?.trim()) {
    const birthday = meCardBirthday(content.birthday);
    if (!birthday) return issue("birthday", "Pick a date for the birthday");
    const pad = (value: number) => String(value).padStart(2, "0");
    const today = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    if (birthday > today) {
      return issue("birthday", "The birthday is in the future");
    }
  }
  return null;
}

/** The MECARD: payload; "" while the content has a problem. */
export function encodeMeCard(content: MeCardContent, now?: Date): string {
  if (meCardIssue(content, now)) return "";
  const first = escapeMeCard(content.firstName);
  const last = escapeMeCard(content.lastName ?? "");
  const fields: string[] = [`N:${last ? `${last},${first}` : first}`];
  const add = (name: string, value: string | undefined) => {
    const text = escapeMeCard(value ?? "");
    if (text) fields.push(`${name}:${text}`);
  };
  add("SOUND", content.reading);
  if (content.phone?.trim()) fields.push(`TEL:${phoneDigits(content.phone)}`);
  add("EMAIL", content.email);
  if (content.birthday?.trim()) {
    fields.push(`BDAY:${meCardBirthday(content.birthday)}`);
  }
  add("ADR", content.address);
  if (content.url?.trim()) {
    const url = content.url.trim();
    add("URL", /^[a-z][a-z\d+.-]*:/i.test(url) ? url : `https://${url}`);
  }
  add("NICKNAME", content.nickname);
  add("NOTE", content.note);
  return `MECARD:${fields.join(";")};;`;
}
