import { track } from "./track";

/**
 * Why the sign-in dialog (or a quiet sign-up line) appeared: the thing the
 * visitor was doing. The app's dialog shows one line for each reason
 * (apps/app/messages/en.json, auth.reasons), and the reason travels with
 * auth_prompt_shown, auth_prompt_dismissed and the sign_up / sign_in that
 * follows, so the funnel shows which moments bring accounts.
 */
export const AUTH_PROMPT_REASONS = [
  "save_design",
  "make_dynamic",
  "hosted_page",
  "ai_art",
  "ai_chat",
  "upload_frame",
  "publish_frame",
  "community_action",
  "save_barcode",
  "bulk_over_limit",
  "keep_designs",
  "after_download",
  "upgrade",
  // A friend's invite link: the note about the extra codes (apps/app
  // components/invites/invite-note.tsx)
  "invite",
  "nav",
] as const;

export type AuthPromptReason = (typeof AUTH_PROMPT_REASONS)[number];

/** The dialog itself, or a line in the page that offers it (a nudge). */
export type AuthPromptKind = "dialog" | "nudge";

export interface AuthPrompt {
  reason: AuthPromptReason;
  /**
   * Where it appeared: a site section ("playground", "tools/bulk",
   * "pricing") or a part of the chrome ("header"). A name, never an address.
   */
  surface: string;
}

const REASONS = new Set<string>(AUTH_PROMPT_REASONS);
const SURFACE = /^[a-z0-9][a-z0-9_/-]{0,39}$/;

export function isAuthPromptReason(value: unknown): value is AuthPromptReason {
  return typeof value === "string" && REASONS.has(value);
}

/** A surface name as sent: lower-case letters, digits, "_", "-" and "/". */
export function cleanSurface(value: unknown): string {
  if (typeof value !== "string") return "other";
  const surface = value.trim().toLowerCase();
  return SURFACE.test(surface) && !surface.includes("//") ? surface : "other";
}

// The last dialog shown in this tab, so the sign_up or sign_in it leads to
// can say why. sessionStorage: it survives the Google or GitHub round trip
// in the same tab, and dies with the tab.
const PROMPT_KEY = "qrdx:auth-prompt";
/** A sign-in this long after the dialog opened isn't credited to it. */
export const AUTH_PROMPT_MAX_AGE_MS = 30 * 60_000;

type StoredPrompt = AuthPrompt & { at: number };

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Remembers the dialog that just opened (replacing any earlier one). */
export function rememberAuthPrompt(
  prompt: AuthPrompt,
  now: number = Date.now(),
  store: Storage | null = storage()
): void {
  try {
    store?.setItem(
      PROMPT_KEY,
      JSON.stringify({
        reason: prompt.reason,
        surface: cleanSurface(prompt.surface),
        at: now,
      } satisfies StoredPrompt)
    );
  } catch {
    // Storage blocked or full: the sign-up just isn't attributed.
  }
}

/** Forgets it (the visitor closed the dialog without signing in). */
export function forgetAuthPrompt(store: Storage | null = storage()): void {
  try {
    store?.removeItem(PROMPT_KEY);
  } catch {
    // Nothing to forget.
  }
}

/**
 * The dialog a sign-in that happened now came from, once: it's forgotten as
 * it's read. Null when there was none, it's too old or it's malformed.
 */
export function takeAuthPrompt(
  now: number = Date.now(),
  store: Storage | null = storage()
): AuthPrompt | null {
  let raw: string | null = null;
  try {
    raw = store?.getItem(PROMPT_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  forgetAuthPrompt(store);
  try {
    const parsed = JSON.parse(raw) as Partial<StoredPrompt>;
    if (!isAuthPromptReason(parsed.reason)) return null;
    if (typeof parsed.at !== "number" || !Number.isFinite(parsed.at)) {
      return null;
    }
    if (parsed.at > now || now - parsed.at > AUTH_PROMPT_MAX_AGE_MS) {
      return null;
    }
    return { reason: parsed.reason, surface: cleanSurface(parsed.surface) };
  } catch {
    return null;
  }
}

/**
 * auth_prompt_shown. A dialog is also remembered, so the sign-up it leads to
 * carries its reason.
 */
export function trackAuthPromptShown(
  prompt: AuthPrompt,
  kind: AuthPromptKind
): void {
  const surface = cleanSurface(prompt.surface);
  if (kind === "dialog") rememberAuthPrompt({ ...prompt, surface });
  track("auth_prompt_shown", { reason: prompt.reason, surface, kind });
}

/** auth_prompt_dismissed: closed without signing in, or a nudge waved off. */
export function trackAuthPromptDismissed(
  prompt: AuthPrompt,
  kind: AuthPromptKind
): void {
  if (kind === "dialog") forgetAuthPrompt();
  track("auth_prompt_dismissed", {
    reason: prompt.reason,
    surface: cleanSurface(prompt.surface),
    kind,
  });
}
