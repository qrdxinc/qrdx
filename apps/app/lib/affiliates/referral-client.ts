// The referral code in the browser (client-safe, no server imports).
//
// Same visit only: the code from the link (/?ref=<code>) is kept in this
// tab's memory (a variable in this module, gone when the tab closes or
// reloads) and in the address bar, and the sign-in panel sends it along with
// a sign-up (a request header for email codes, the OAuth state for Google
// and GitHub). Nothing is ever written to the device: no cookie, no
// localStorage, no sessionStorage. A link from the marketing site's pages
// (another app on qrdx.dev, so a new page) carries the visit, code
// included, in its address (@repo/analytics/landing visitRef).
import { visitRef } from "@repo/analytics/landing";
import { isHandoffTag } from "@/lib/analytics/handoff-tags";
import { parseReferralCode } from "./rules";
import { AFFILIATE_REF_PARAM } from "./terms";

let pending: string | null = null;

/** The address bar's code; QRdx's own `ref` tags (a plugin's link) aren't codes. */
function codeInAddressBar(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const code = parseReferralCode(
      new URLSearchParams(window.location.search).get(AFFILIATE_REF_PARAM),
    );
    return code && !isHandoffTag(code) ? code : null;
  } catch {
    return null;
  }
}

/** The code the visit started with, carried here from another page of this origin (or read on this one). */
function codeCarried(): string | null {
  const code = parseReferralCode(visitRef());
  return code && !isHandoffTag(code) ? code : null;
}

/** Keeps the address bar's code (if any) for the rest of this tab's visit. */
export function captureReferralFromUrl(): string | null {
  const code = codeInAddressBar() ?? codeCarried();
  if (code && !pending) pending = code;
  return pending;
}

/** The code this tab's sign-up should carry, if it has one. */
export function pendingReferralCode(): string | null {
  return pending ?? codeInAddressBar() ?? codeCarried();
}

/** Clears the in-memory code (tests). */
export function forgetPendingReferral(): void {
  pending = null;
}
