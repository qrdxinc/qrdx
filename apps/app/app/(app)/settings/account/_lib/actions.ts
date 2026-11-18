"use server";

import { cookiesToSet } from "@repo/auth/passkey";
import { auth } from "@repo/auth/server";
import {
  account as accountTable,
  database as db,
  session as sessionTable,
} from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import cuid from "cuid";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import {
  AVATAR_MAX_BYTES,
  type AvatarMime,
  avatarKey,
  avatarKeyFromImage,
} from "@/lib/account/avatar";
import { confirmedSession } from "@/lib/account/confirmation-server";
import {
  type LinkedAccount,
  PROVIDER_LABELS,
  SOCIAL_PROVIDERS,
  unlinkBlockMessages,
  unlinkBlockReason,
} from "@/lib/account/sign-in-methods";
import { SNIFF_BYTES, sniffFileType } from "@/lib/files/magic";
import { settingsActionText } from "@/lib/i18n/settings-action-text";
import type { Translator } from "@/lib/i18n/translator";
import { baseUrl } from "@/lib/metadata";
import { logError } from "@/lib/shared";
import {
  deleteObject,
  isStorageConfigured,
  publicUrl,
  putObject,
} from "@/lib/storage/r2";

// Settings → Account. auth.api calls bypass Better Auth's HTTP rate limiter,
// so actions are limited per user here, each kind on its own limiter.
//
// Linking and unlinking Google or GitHub change how the account can be
// signed in to, so both need a recent "Confirm it's you"
// (lib/account/confirmation.ts) and answer CONFIRMATION_REQUIRED without one.
// Over HTTP, Better Auth's /link-social and /unlink-account ask the same
// (packages/auth/confirm-gate.ts). Signing out sessions never asks and is
// never rate limited: someone whose account is under attack must be able to
// sign the attacker out at once, and a limiter the attacker's session shares
// would let it use up their tries first.
//
// Refusals are in the person's language (settingsActions.account, through
// lib/i18n/settings-action-text.ts); the page shows them as they are.

export type AccountActionResult = { ok: true } | { ok: false; error: string };

const profileLimiter = createRateLimiter({
  prefix: "qrdx:account-profile",
  limiter: slidingWindow(20, "10 m"),
});
const signInMethodsLimiter = createRateLimiter({
  prefix: "qrdx:account-sign-in-methods",
  limiter: slidingWindow(20, "10 m"),
});

const PATH = "/settings/account";

const fail = (error: string): AccountActionResult => ({ ok: false, error });

/** settingsActions.account in the person's language, read when refusing. */
const accountText = () => settingsActionText("settingsActions.account");

interface SignedIn {
  userId: string;
  image: string | null;
  sessionId: string;
  requestHeaders: Headers;
}

async function signedIn(): Promise<SignedIn | null> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) return null;
  return {
    userId: session.user.id,
    image: session.user.image ?? null,
    sessionId: session.session.id,
    requestHeaders,
  };
}

/** Better Auth APIError code (e.g. "PROVIDER_NOT_FOUND"), if any. */
function authErrorCode(error: unknown): string | undefined {
  return (error as { body?: { code?: string } })?.body?.code;
}

// ─── Profile ────────────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const MAX_NAME_LENGTH = 64;

// Each issue is named by its message's key in settingsActions.account.
const nameSchema = z
  .string()
  .trim()
  .min(1, "nameMissing")
  .max(MAX_NAME_LENGTH, "nameTooLong")
  .refine((value) => !CONTROL_CHARACTERS.test(value), "nameSpecialCharacters");

function nameIssue(
  issue: string | undefined,
  t: Translator<"settingsActions.account">,
): string {
  switch (issue) {
    case "nameTooLong":
      return t("nameTooLong", { max: String(MAX_NAME_LENGTH) });
    case "nameSpecialCharacters":
      return t("nameSpecialCharacters");
    case "nameMissing":
    case undefined:
      return t("nameMissing");
    default:
      // Not text at all (a tampered request): zod's own words, as before.
      return issue;
  }
}

export async function updateProfileName(
  input: unknown,
): Promise<AccountActionResult> {
  const text = accountText();
  const parsed = z.object({ name: nameSchema }).safeParse(input);
  if (!parsed.success) {
    return fail(nameIssue(parsed.error.issues[0]?.message, await text()));
  }
  try {
    const user = await signedIn();
    if (!user) return fail((await text())("profileSignedOut"));
    if (!(await profileLimiter.limit(user.userId)).success) {
      return fail((await text())("rateLimited"));
    }
    await auth.api.updateUser({
      headers: user.requestHeaders,
      body: { name: parsed.data.name },
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.updateName" });
    return fail((await text())("failed"));
  }
}

const SNIFFED_AVATAR_MIME: Partial<Record<string, AvatarMime>> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** The browser sends a cropped, re-encoded square (see avatar-field.tsx). */
export async function uploadAvatar(
  formData: FormData,
): Promise<AccountActionResult & { image?: string }> {
  const text = accountText();
  try {
    const user = await signedIn();
    if (!user) return fail((await text())("profileSignedOut"));
    if (!isStorageConfigured) {
      return fail((await text())("uploadsUnavailable"));
    }
    const file = formData.get("avatar");
    if (!(file instanceof File) || file.size === 0) {
      return fail((await text())("pictureMissing"));
    }
    if (file.size > AVATAR_MAX_BYTES) {
      return fail((await text())("pictureTooLarge"));
    }
    if (!(await profileLimiter.limit(user.userId)).success) {
      return fail((await text())("rateLimited"));
    }

    // The bytes decide the type, whatever the browser said.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sniffed = sniffFileType(bytes.subarray(0, SNIFF_BYTES));
    const mime = sniffed ? SNIFFED_AVATAR_MIME[sniffed] : undefined;
    if (!mime) return fail((await text())("pictureType"));

    const key = avatarKey(user.userId, cuid(), mime);
    await putObject(key, bytes, {
      mime,
      // Every upload gets a new key, so the object never changes.
      cacheControl: "public, max-age=31536000, immutable",
    });
    // Public bucket URL, else /api/avatars/<userId>/<file> (signed redirect).
    const image = publicUrl(key) ?? new URL(`/api/${key}`, baseUrl).toString();

    await auth.api.updateUser({
      headers: user.requestHeaders,
      body: { image },
    });
    const previous = avatarKeyFromImage(user.image, user.userId);
    if (previous && previous !== key) {
      await deleteObject(previous).catch((error) =>
        logError(error as Error, { action: "account.avatar.deletePrevious" }),
      );
    }
    revalidatePath(PATH);
    return { ok: true, image };
  } catch (error) {
    logError(error as Error, { action: "account.uploadAvatar" });
    return fail((await text())("failed"));
  }
}

export async function removeAvatar(): Promise<AccountActionResult> {
  const text = accountText();
  try {
    const user = await signedIn();
    if (!user) return fail((await text())("profileSignedOut"));
    if (!(await profileLimiter.limit(user.userId)).success) {
      return fail((await text())("rateLimited"));
    }
    await auth.api.updateUser({
      headers: user.requestHeaders,
      body: { image: null },
    });
    const previous = avatarKeyFromImage(user.image, user.userId);
    if (previous && isStorageConfigured) {
      await deleteObject(previous).catch((error) =>
        logError(error as Error, { action: "account.avatar.delete" }),
      );
    }
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.removeAvatar" });
    return fail((await text())("failed"));
  }
}

// ─── Sign-in methods ────────────────────────────────────────────────────────

const idSchema = z.string().trim().min(1).max(128);

export type LinkStartResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

const linkFail = (error: string): LinkStartResult => ({ ok: false, error });

/**
 * "Link" for Google or GitHub: after a recent "Confirm it's you", starts
 * Better Auth's link flow and answers the provider's URL for the browser to
 * open. The flow's state cookie is passed on to the browser; the provider
 * comes back to Better Auth's callback, which links the account (same email
 * only) and returns to Settings with ?linked= or ?error=.
 */
export async function linkSignInMethod(
  input: unknown,
): Promise<LinkStartResult> {
  const parsed = z
    .object({ provider: z.enum(SOCIAL_PROVIDERS) })
    .safeParse(input);
  // Only a tampered request names another provider: English, as it was.
  if (!parsed.success) return linkFail("That sign-in method can't be linked.");
  const { provider } = parsed.data;
  const text = accountText();
  try {
    const allowed = await confirmedSession(async () =>
      (await text())("methodsSignedOut"),
    );
    if (!allowed.ok) return allowed;
    const { session } = allowed;
    if (!(await signInMethodsLimiter.limit(session.userId)).success) {
      return linkFail((await text())("rateLimited"));
    }
    const { headers: responseHeaders, response } =
      await auth.api.linkSocialAccount({
        headers: session.requestHeaders,
        body: {
          provider,
          callbackURL: `${PATH}?linked=${provider}#sign-in`,
          errorCallbackURL: PATH,
          disableRedirect: true,
        },
        returnHeaders: true,
      });
    const url = (response as { url?: unknown } | null)?.url;
    if (typeof url !== "string" || !url.startsWith("https://")) {
      throw new Error("The link flow returned no provider URL");
    }
    const jar = await cookies();
    for (const cookie of cookiesToSet(responseHeaders)) {
      jar.set(cookie.name, cookie.value, cookie.options);
    }
    return { ok: true, url };
  } catch (error) {
    // Not set up on this server: nothing to log.
    if (authErrorCode(error) !== "PROVIDER_NOT_FOUND") {
      logError(error as Error, { action: "account.link" });
    }
    return linkFail(
      (await text())("linkUnavailable", {
        provider: PROVIDER_LABELS[provider],
      }),
    );
  }
}

/**
 * "Unlink": after a recent "Confirm it's you", removes a Google or GitHub
 * link of this account. Better Auth's own unlink also wants a sign-in within
 * the last day, a weaker check than the confirmation (and one a confirmed
 * person would then be asked for again), so the row is deleted here, for
 * this user only, once the same checks have passed.
 */
export async function unlinkSignInMethod(
  input: unknown,
): Promise<AccountActionResult> {
  const parsed = z.object({ accountId: idSchema }).safeParse(input);
  // An id that can't be one (a tampered request): English, as it was.
  if (!parsed.success) return fail("Invalid sign-in method.");
  const text = accountText();
  const blockedText = async () =>
    unlinkBlockMessages(
      await settingsActionText("settingsActions.account.unlinkBlocked")(),
    );
  try {
    const allowed = await confirmedSession(async () =>
      (await text())("methodsSignedOut"),
    );
    if (!allowed.ok) return allowed;
    const { session } = allowed;
    if (!(await signInMethodsLimiter.limit(session.userId)).success) {
      return fail((await text())("rateLimited"));
    }
    const accounts: LinkedAccount[] = await auth.api.listUserAccounts({
      headers: session.requestHeaders,
    });
    const blocked = unlinkBlockReason(accounts, parsed.data.accountId);
    if (blocked) return fail((await blockedText())[blocked]);

    const removed = await db
      .delete(accountTable)
      .where(
        and(
          eq(accountTable.id, parsed.data.accountId),
          eq(accountTable.userId, session.userId),
        ),
      )
      .returning({ id: accountTable.id });
    if (removed.length === 0) {
      return fail((await blockedText())["not-found"]);
    }
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.unlink" });
    return fail((await text())("failed"));
  }
}

// ─── Sessions ───────────────────────────────────────────────────────────────

// Never "Confirm it's you" here, and no rate limit: someone whose account is
// under attack must be able to sign the attacker's sessions out at once. A
// limiter per user is one a stolen session shares, so it could spend the
// tries (on ids that don't exist) to keep the owner from signing it out.
// Nothing here needs one: a revoke reads one row, by id and for this user
// only, and deletes at most one of the user's own sessions; signing out the
// others deletes them in one go.

export async function revokeSession(
  input: unknown,
): Promise<AccountActionResult> {
  const parsed = z.object({ sessionId: idSchema }).safeParse(input);
  // An id that can't be one (a tampered request): English, as it was.
  if (!parsed.success) return fail("Invalid session.");
  const text = accountText();
  try {
    const user = await signedIn();
    if (!user) return fail((await text())("sessionsSignedOut"));
    if (parsed.data.sessionId === user.sessionId) {
      return fail((await text())("thisDevice"));
    }
    // Tokens never reach the browser: look this one up by id, for this user only.
    const [row] = await db
      .select({ token: sessionTable.token })
      .from(sessionTable)
      .where(
        and(
          eq(sessionTable.id, parsed.data.sessionId),
          eq(sessionTable.userId, user.userId),
        ),
      )
      .limit(1);
    if (row) {
      await auth.api.revokeSession({
        headers: user.requestHeaders,
        body: { token: row.token },
      });
    }
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.revokeSession" });
    return fail((await text())("failed"));
  }
}

export async function revokeOtherSessions(): Promise<AccountActionResult> {
  const text = accountText();
  try {
    const user = await signedIn();
    if (!user) return fail((await text())("sessionsSignedOut"));
    await auth.api.revokeOtherSessions({ headers: user.requestHeaders });
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.revokeOtherSessions" });
    return fail((await text())("failed"));
  }
}
