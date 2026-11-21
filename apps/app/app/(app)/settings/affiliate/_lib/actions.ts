"use server";

import { auth } from "@repo/auth/server";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import {
  currentSession,
  requireRecentConfirmation,
} from "@/lib/account/confirmation-server";
import { MAX_EMAIL_LENGTH } from "@/lib/account/email-change";
import { isMissingTableError } from "@/lib/affiliates/missing-table";
import { sendPayoutEmailNotice } from "@/lib/affiliates/paypal-notice-server";
import {
  applyForAffiliate,
  chooseReferralCode,
  getAffiliateForUser,
  setPaypalEmail,
} from "@/lib/affiliates/program";
import {
  type AffiliateStatus,
  chosenCodeMessages,
} from "@/lib/affiliates/rules";
import { HttpError } from "@/lib/error-response";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { settingsActionText } from "@/lib/i18n/settings-action-text";
import type { Translator } from "@/lib/i18n/translator";
import { logError } from "@/lib/log-error";
import { enforceRateLimits } from "@/lib/request-guards";

// The signed-in side of the affiliate program: applying (/affiliates) and the
// PayPal address (Settings → Affiliate program). /affiliates is English only,
// so applying answers in English; Settings answers in the person's language
// (settingsActions.affiliate), read only when refusing.

export type AffiliateActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const NOT_READY = "The affiliate program isn't available yet.";
const SIGNED_OUT = "Sign in to continue.";
const SOMETHING_WRONG = "Something went wrong. Please try again.";

type AffiliateText = () => Promise<Translator<"settingsActions.affiliate">>;
const affiliateText = (): AffiliateText =>
  settingsActionText("settingsActions.affiliate");

const applyLimiter = createRateLimiter({ limiter: slidingWindow(5, "1 h") });
const paypalLimiter = createRateLimiter({ limiter: slidingWindow(10, "1 h") });
const codeLimiter = createRateLimiter({ limiter: slidingWindow(10, "1 h") });

/** In English, or with `text` in the person's language. */
async function failure(
  error: unknown,
  action: string,
  text?: AffiliateText,
): Promise<AffiliateActionResult<never>> {
  const t = text ? await text() : null;
  if (isMissingTableError(error)) {
    return { ok: false, error: t ? t("notReady") : NOT_READY };
  }
  if (error instanceof HttpError) {
    // The only one here: enforceRateLimits' refusal.
    const limited = t && error.code === "RATE_LIMITED";
    return { ok: false, error: limited ? t("rateLimited") : error.message };
  }
  logError(error as Error, { action });
  return { ok: false, error: t ? t("failed") : SOMETHING_WRONG };
}

export interface ApplyState {
  signedIn: boolean;
  /** The affiliate tables exist. */
  ready: boolean;
  status: AffiliateStatus | null;
}

/** What the apply form on /affiliates should show this visitor. */
export async function getAffiliateApplyState(): Promise<ApplyState> {
  const session = await auth.api
    .getSession({ headers: await headers() })
    .catch(() => null);
  if (!session?.user) return { signedIn: false, ready: true, status: null };
  if (!isFeatureAvailable("affiliates")) {
    return { signedIn: true, ready: false, status: null };
  }
  try {
    const row = await getAffiliateForUser(session.user.id);
    return {
      signedIn: true,
      ready: true,
      status: (row?.status as AffiliateStatus | undefined) ?? null,
    };
  } catch (error) {
    if (!isMissingTableError(error)) {
      logError(error as Error, { action: "affiliates.apply_state" });
    }
    return { signedIn: true, ready: false, status: null };
  }
}

const applySchema = z.object({
  website: z
    .string()
    .trim()
    .max(200, "Keep the website or profile under 200 characters.")
    .default(""),
  promotion: z
    .string()
    .trim()
    .min(20, "Tell us a little more (at least 20 characters).")
    .max(1000, "Keep it under 1,000 characters."),
  agree: z.literal(true, {
    error: "Read and accept the affiliate terms to apply.",
  }),
});

export async function applyForAffiliateAction(
  input: z.input<typeof applySchema>,
): Promise<AffiliateActionResult<{ status: AffiliateStatus }>> {
  if (!isFeatureAvailable("affiliates")) return { ok: false, error: NOT_READY };
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the form.",
    };
  }
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { ok: false, error: SIGNED_OUT };
    await enforceRateLimits([
      { limiter: applyLimiter, key: `affiliates:apply:${session.user.id}` },
    ]);
    const row = await applyForAffiliate({
      userId: session.user.id,
      application: {
        website: parsed.data.website,
        promotion: parsed.data.promotion,
      },
    });
    revalidatePath("/settings/affiliate");
    return { ok: true, data: { status: row.status as AffiliateStatus } };
  } catch (error) {
    return await failure(error, "affiliates.apply");
  }
}

const paypalSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(MAX_EMAIL_LENGTH)
    // Its key in settingsActions.affiliate.
    .email("paypalEmailInvalid"),
});

/**
 * Where payouts go. It changes where money is sent, so it asks "Confirm
 * it's you" first, only an approved affiliate can set it, and the account's
 * address gets a security email about it (like a passkey or two-step
 * change). Admins see how long ago it changed next to "Mark paid".
 */
export async function savePaypalEmailAction(
  input: z.input<typeof paypalSchema>,
): Promise<AffiliateActionResult> {
  const text = affiliateText();
  if (!isFeatureAvailable("affiliates")) {
    return { ok: false, error: (await text())("notReady") };
  }
  const parsed = paypalSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message;
    const t = await text();
    return {
      ok: false,
      // Zod's own words for an address too long to be one, as before.
      error:
        issue === "paypalEmailInvalid"
          ? t("paypalEmailInvalid")
          : (issue ?? t("paypalEmailMissing")),
    };
  }
  try {
    const session = await currentSession();
    if (!session) return { ok: false, error: (await text())("signedOut") };
    // Before the limit, so the round trip that asks doesn't use one up.
    const needed = await requireRecentConfirmation(session);
    if (needed) return needed;
    await enforceRateLimits([
      { limiter: paypalLimiter, key: `affiliates:paypal:${session.userId}` },
    ]);
    const saved = await setPaypalEmail({
      userId: session.userId,
      email: parsed.data.email,
    });
    if (saved.status === "not_approved") {
      return { ok: false, error: (await text())("paypalNotApproved") };
    }
    if (saved.status === "saved") {
      const notice = () =>
        sendPayoutEmailNotice({
          email: session.email,
          paypalEmail: parsed.data.email,
          replaced: saved.previous !== null,
        });
      try {
        after(notice);
      } catch {
        // No request to wait for (tests): send now.
        void notice();
      }
    }
    revalidatePath("/settings/affiliate");
    return { ok: true, data: null };
  } catch (error) {
    return await failure(error, "affiliates.paypal", text);
  }
}

const codeSchema = z.object({ code: z.string().trim().toLowerCase().max(64) });

/**
 * An approved affiliate swaps their random code for one they choose, once.
 * Their random code keeps working (affiliate.previous_code).
 */
export async function chooseReferralCodeAction(
  input: z.input<typeof codeSchema>,
): Promise<AffiliateActionResult<{ code: string }>> {
  const text = affiliateText();
  const codeText = async () =>
    chosenCodeMessages(
      await settingsActionText("settingsActions.affiliate.chosenCode")(),
    );
  if (!isFeatureAvailable("affiliates")) {
    return { ok: false, error: (await text())("notReady") };
  }
  const parsed = codeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: (await codeText()).format };
  }
  try {
    const session = await currentSession();
    if (!session) return { ok: false, error: (await text())("signedOut") };
    await enforceRateLimits([
      { limiter: codeLimiter, key: `affiliates:code:${session.userId}` },
    ]);
    const result = await chooseReferralCode({
      userId: session.userId,
      code: parsed.data.code,
      ownEmails: [session.email],
    });
    switch (result.status) {
      case "saved":
        revalidatePath("/settings/affiliate");
        return { ok: true, data: { code: result.code } };
      case "unchanged":
        return { ok: false, error: (await text())("codeUnchanged") };
      case "not_approved":
        return { ok: false, error: (await text())("codeNotApproved") };
      default:
        return { ok: false, error: (await codeText())[result.status] };
    }
  } catch (error) {
    return await failure(error, "affiliates.code", text);
  }
}
