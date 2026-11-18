import type { Translator } from "@/lib/i18n/translator";
import type { NoticeDeliveryDeps } from "./email-change";
import {
  type DeviceWords,
  describeUserAgent,
  ENGLISH_DEVICE_WORDS,
} from "./sessions";

/**
 * Settings → Profile & security → Passkeys: what the page shows for each
 * passkey, and the messages for adding, renaming and removing one. Pure and
 * client-safe; the server actions are app/(app)/settings/account/_lib
 * passkey-actions.ts. Better Auth's passkey plugin stores the rows
 * (packages/auth/passkey.ts has QRdx's rules).
 */

/** The columns the page reads; keys and counters never leave the server. */
export interface PasskeyRow {
  id: string;
  name: string | null;
  createdAt: Date | null;
  deviceType: string;
  backedUp: boolean;
  aaguid: string | null;
}

export interface PasskeyView {
  id: string;
  name: string;
  /** "Added Nov 5, 2026" (empty when the date is unknown) */
  added: string;
  /** Saved to a password manager or cloud keychain, so on every device signed in to it */
  synced: boolean;
  /** "Google Password Manager", when the authenticator says which it is */
  provider: string | null;
}

export const MAX_PASSKEY_NAME_LENGTH = 64;
const FALLBACK_NAME = "Passkey";

/**
 * "Chrome on macOS", like the Sessions list; "Passkey" when unknown. In
 * English unless given another language's device words and fallback
 * (newPasskeyName() in ./passkey-name-server.ts). The stolen-session check
 * reads the English label on its own (./session-origin.ts browserFamily).
 */
export function defaultPasskeyName(
  userAgent: string | null,
  words: DeviceWords = ENGLISH_DEVICE_WORDS,
  fallback: string = FALLBACK_NAME,
): string {
  const { label } = describeUserAgent(userAgent, words);
  return label === words.unknownDevice ? fallback : label;
}

/** Trimmed, single-spaced and at most 64 characters; null when empty. */
export function normalizePasskeyName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.slice(0, MAX_PASSKEY_NAME_LENGTH).trim();
}

/** Newest first, named, with the kind the person can recognise. */
export function toPasskeyViews(
  rows: PasskeyRow[],
  {
    formatDate,
    providerName = () => undefined,
    addedOn = (date) => `Added ${date}`,
    fallbackName = FALLBACK_NAME,
  }: {
    formatDate: (date: Date) => string;
    providerName?: (aaguid: string | null) => string | undefined;
    /** "Added Nov 5, 2026", in the page's language (English by default) */
    addedOn?: (date: string) => string;
    /** The name of a passkey saved without one, and with no known provider */
    fallbackName?: string;
  },
): PasskeyView[] {
  return [...rows]
    .sort(
      (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
    )
    .map((row) => {
      const provider = providerName(row.aaguid) ?? null;
      return {
        id: row.id,
        name: normalizePasskeyName(row.name) ?? provider ?? fallbackName,
        added: row.createdAt ? addedOn(formatDate(row.createdAt)) : "",
        synced: row.backedUp,
        provider,
      };
    });
}

export const PASSKEY_MESSAGES = {
  reauth:
    "For your security, sign out and sign in again, then add your passkey within a day.",
  signedOut: "Sign in to manage your passkeys.",
  invalidName: "Give the passkey a name.",
  notFound: "That passkey is already gone. Refresh the page.",
  cancelled: "Adding the passkey was cancelled.",
  alreadyAdded:
    "This device or password manager already has a passkey for your account.",
  noUserVerification:
    "That passkey didn't ask for your PIN, fingerprint or face, so it can't be used with QRdx. Try another device or password manager.",
  expired: "That took too long. Try adding the passkey again.",
  notSupported: "This browser can't create passkeys.",
  rateLimited: "Too many tries. Wait a few minutes and try again.",
  failed: "Something went wrong. Please try again.",
} as const;

/** PASSKEY_MESSAGES in any language. */
export type PasskeyMessages = Record<keyof typeof PASSKEY_MESSAGES, string>;

/**
 * PASSKEY_MESSAGES in the person's language (auth.passkeyMessages in
 * messages/en.json), for answers the server sends to "Confirm it's you"
 * and Settings (lib/account/confirmation-server.tsx).
 */
export function passkeyMessages(
  t: Translator<"auth.passkeyMessages">,
): PasskeyMessages {
  return {
    reauth: t("reauth"),
    signedOut: t("signedOut"),
    invalidName: t("invalidName"),
    notFound: t("notFound"),
    cancelled: t("cancelled"),
    alreadyAdded: t("alreadyAdded"),
    noUserVerification: t("noUserVerification"),
    expired: t("expired"),
    notSupported: t("notSupported"),
    rateLimited: t("rateLimited"),
    failed: t("failed"),
  };
}

/** What a Better Auth APIError carries (auth.api throws these). */
interface AuthErrorLike {
  statusCode?: number;
  body?: { code?: string; message?: string };
}

/**
 * Adding a passkey on the server failed: a message for a known reason (and
 * whether a fresh sign-in is needed), else null. `messages` are
 * PASSKEY_MESSAGES in the person's language (English by default).
 */
export function registrationFailure(
  error: unknown,
  messages: PasskeyMessages = PASSKEY_MESSAGES,
): { message: string; reauth: boolean } | null {
  const { body } =
    error && typeof error === "object" ? (error as AuthErrorLike) : {};
  switch (body?.code) {
    case "SESSION_NOT_FRESH":
      return { message: messages.reauth, reauth: true };
    case "UNAUTHORIZED":
    case "SESSION_REQUIRED":
      return { message: messages.signedOut, reauth: false };
    case "CHALLENGE_NOT_FOUND":
      return { message: messages.expired, reauth: false };
    case "PASSKEY_USER_VERIFICATION_REQUIRED":
      return { message: messages.noUserVerification, reauth: false };
  }
  return null;
}

/**
 * The browser step failed (@simplewebauthn/browser's WebAuthnError codes,
 * passed through by the plugin's client): a message for the person.
 */
export function browserFailureMessage(code: string | undefined): string {
  switch (code) {
    case "ERROR_CEREMONY_ABORTED":
    case "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY":
      return PASSKEY_MESSAGES.cancelled;
    case "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED":
      return PASSKEY_MESSAGES.alreadyAdded;
    case "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT":
    case "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT":
      return PASSKEY_MESSAGES.noUserVerification;
    default:
      return PASSKEY_MESSAGES.failed;
  }
}

/**
 * Signing in with a passkey failed: the line under the button
 * (auth.passkeySignIn.errors on the sign-in screens).
 */
export function signInFailureMessage(
  error: { code?: string; status?: number },
  t: Translator<"auth.passkeySignIn.errors">,
): string | null {
  if (error.status === 429) return t("rateLimited");
  switch (error.code) {
    // Closed the browser's prompt, or picked nothing: say nothing.
    case "AUTH_CANCELLED":
    case "ERROR_CEREMONY_ABORTED":
    case "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY":
      return null;
    case "PASSKEY_USER_VERIFICATION_REQUIRED":
      return t("userVerification");
    case "PASSKEY_NOT_FOUND":
      return t("notFound");
    case "BANNED_USER":
      return t("banned");
    // The account's address is at a domain whose company requires SSO.
    case "sso_required":
      return t("ssoRequired");
    default:
      return t("failed");
  }
}

/**
 * The "a passkey was added/removed" notice (the same delivery rules as the
 * email-change notice: emailed where outbound delivery is on, written to the
 * console in local dev). Never throws: the change already happened, so a
 * failed notice is reported, not undone.
 */
export async function deliverPasskeyNotice(
  { email, subject }: { email: string; subject: string },
  deps: NoticeDeliveryDeps,
): Promise<"emailed" | "logged" | "not-sent"> {
  try {
    if (deps.deliveryAllowed && deps.nodeEnv !== "test") {
      const result = await deps.send();
      return result.sent ? "emailed" : "not-sent";
    }
    if (deps.nodeEnv === "production") return "not-sent";
    deps.log(
      `[dev only] QRdx security notice for ${email}: "${subject}" (not emailed: delivery is off outside production)`,
    );
    return "logged";
  } catch {
    return "not-sent";
  }
}
