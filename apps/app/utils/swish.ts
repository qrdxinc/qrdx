// Swish (Sweden) payment codes, in the format Swish's developer
// documentation describes ("Create QR code from specification"):
//
//   https://app.swish.nu/1/p/sw/?sw=<number>[&amt=<amount>][&msg=<message>]
//     [&edit=amt|msg|amt,msg]
//
// A link, so the phone's camera opens the Swish app (app.swish.nu is the
// app's verified link domain), and Swish's own scanner reads it too. An
// amount or message in the link is locked unless `edit` names it.

import type { SwishContent } from "@/types/qr-content";

export const SWISH_BASE = "https://app.swish.nu/1/p/sw/";

/** Swish's documented message limit. */
export const SWISH_MESSAGE_MAX = 50;

/** The range Swish's own code generator takes, in kronor. */
export const SWISH_MIN_AMOUNT = 1;
export const SWISH_MAX_AMOUNT = 150_000;

/** The characters Swish's own generator allows in a message. */
const SWISH_MESSAGE =
  /^[a-zåäöA-ZÅÄÖ0-9 !?=#$%&()*+,\-./:;<'"@^¡¢£€¥¿Š§šŽžŒœŸÀ-ÖØ-öø-ÿ]*$/;

export interface SwishIssue {
  field?: string;
  message: string;
}

const issue = (field: string, message: string): SwishIssue => ({
  field,
  message,
});

/**
 * A Swish number as the links write it: a 10-digit business number
 * starting with 123 as typed, and a Swedish mobile as 46 and 9 digits
 * ("070-123 45 67", "+46 70 123 45 67" → "46701234567"). Null otherwise.
 */
export function normalizeSwishNumber(raw: string): string | null {
  const digits = raw.replace(/[\s()-]/g, "");
  if (/^123\d{7}$/.test(digits)) return digits;
  const mobile = digits.replace(/^\+46|^0046|^46(?=7)/, "0");
  return /^07\d{8}$/.test(mobile) ? `46${mobile.slice(1)}` : null;
}

/** "170" or "170,50" → "170" or "170.50"; null when it isn't an amount. */
export function swishAmount(raw: string | undefined): string | null {
  let value = raw?.trim() ?? "";
  if (/^\d+,\d{1,2}$/.test(value)) value = value.replace(",", ".");
  if (!/^[1-9]\d*(?:\.\d{1,2})?$/.test(value)) return null;
  const amount = Number(value);
  if (amount < SWISH_MIN_AMOUNT || amount > SWISH_MAX_AMOUNT) return null;
  return value;
}

export function swishIssue(content: Partial<SwishContent>): SwishIssue | null {
  if (!content.payee?.trim()) {
    return issue("payee", "Swish number is required");
  }
  if (!normalizeSwishNumber(content.payee)) {
    return issue(
      "payee",
      "Enter a Swedish mobile number, like 070 123 45 67, or a 123 business number",
    );
  }
  if (content.amount?.trim() && !swishAmount(content.amount)) {
    return issue(
      "amount",
      "Amounts are 1 to 150,000 kronor, with up to 2 decimals",
    );
  }
  const message = content.message?.trim() ?? "";
  if ([...message].length > SWISH_MESSAGE_MAX) {
    return issue(
      "message",
      `Messages are at most ${SWISH_MESSAGE_MAX} characters`,
    );
  }
  if (!SWISH_MESSAGE.test(message)) {
    return issue(
      "message",
      "Swish messages take letters, digits and common punctuation only",
    );
  }
  return null;
}

/** A Swish payment link; "" while the content has a problem. */
export function encodeSwish(content: SwishContent): string {
  if (swishIssue(content)) return "";
  const params = [`sw=${normalizeSwishNumber(content.payee)}`];
  const amount = content.amount?.trim() ? swishAmount(content.amount) : null;
  const message = content.message?.trim();
  if (amount) params.push(`amt=${amount}`);
  if (message) params.push(`msg=${encodeURIComponent(message)}`);
  const edit = [
    amount && content.amountEditable ? "amt" : null,
    message && content.messageEditable ? "msg" : null,
  ].filter(Boolean);
  if (edit.length > 0) params.push(`edit=${edit.join(",")}`);
  return `${SWISH_BASE}?${params.join("&")}`;
}
