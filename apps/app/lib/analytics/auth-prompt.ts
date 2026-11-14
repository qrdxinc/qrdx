// Where and how the sign-in dialog opens, as pure decisions (no React, no
// browser globals). Client-safe. The reasons themselves, and the events
// they're sent with, are @repo/analytics/auth-prompt.

import type { AuthPromptReason } from "@repo/analytics/auth-prompt";
import { splitLocale } from "@repo/i18n/paths";

/**
 * How the dialog opens. "auto": as a sign-up ("Create your QRdx account"),
 * unless this browser has signed in before, when it's a sign-in ("Pick up
 * where you left off") with the passkey button. The panel decides, from
 * Better Auth's last-used login method.
 */
export type AuthDialogMode = "signin" | "signup" | "auto";

/**
 * Asking to sign in opens as a sign-in; everything else is something the
 * visitor wanted to make or keep, which a first visit shouldn't hear as
 * "Pick up where you left off".
 */
export function defaultAuthMode(reason: AuthPromptReason): AuthDialogMode {
  return reason === "nav" ? "signin" : "auto";
}

/** Whether the panel shows sign-in (not sign-up) for `mode`. */
export function showsSignIn(
  mode: AuthDialogMode,
  lastLoginMethod: string | null,
): boolean {
  return mode === "signin" || (mode === "auto" && Boolean(lastLoginMethod));
}

const SEGMENT = /^[a-z0-9][a-z0-9_-]{0,31}$/;
/** Sections whose second segment names a fixed page, not an id or a slug. */
const TWO_LEVEL = new Set(["tools", "ai"]);

/**
 * The site section a pathname belongs to, for auth_prompt_shown's
 * `surface`: "home", "playground", "pricing", "tools/bulk", "ai/art". The
 * language prefix is dropped, and so is anything past the section (theme
 * ids, community slugs, workspaces), so it never names a person's page.
 */
export function authPromptSurface(pathname: string | null | undefined): string {
  if (!pathname) return "other";
  const { path } = splitLocale(pathname.split(/[?#]/, 1)[0] ?? "");
  const [first, second] = path.split("/").filter(Boolean);
  if (!first) return "home";
  const section = first.toLowerCase();
  if (!SEGMENT.test(section)) return "other";
  const sub = second?.toLowerCase();
  if (TWO_LEVEL.has(section) && sub && SEGMENT.test(sub)) {
    return `${section}/${sub}`;
  }
  return section;
}
