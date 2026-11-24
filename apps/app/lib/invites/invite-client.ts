// A friend's invite code in the browser (client-safe, no server imports).
//
// Same visit only, like an affiliate's code (lib/affiliates/referral-client.ts):
// the code from the link (/playground?invite=<code>, where /i/<code> sends
// visitors) is read on the visit's first page and kept in memory by
// @repo/analytics/landing, which also carries it across qrdx.dev's two apps
// in a link's address. The sign-in panel sends it with a sign-up (the
// INVITE_HEADER for email codes, the OAuth state for Google and GitHub).
// Nothing is ever written to the device: no cookie, no localStorage, no
// sessionStorage.
import { visitInvite } from "@repo/analytics/landing";

/** The invite code this tab's sign-up should carry, if the visit has one. */
export function pendingInviteCode(): string | null {
  return visitInvite();
}
