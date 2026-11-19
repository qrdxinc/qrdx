import "server-only";

import {
  type NewUserSignUp,
  registerNewUserRecorder,
} from "@repo/auth/referral";
import { after } from "next/server";
import { signUpReferralTask } from "@/lib/affiliates/attribution-hook";
import { sendWelcomeEmail } from "@/lib/email/welcome";
import { recordAcquisition, signUpLandingOf } from "./acquisition";

// Importing this module hands packages/auth the app's recorder for new
// accounts (packages/auth/referral.ts): the affiliate referral the sign-up
// carried (lib/affiliates), then how its visit started (./acquisition.ts),
// whose channel is "affiliate" when the referral counted, and the welcome
// email (lib/email/welcome.tsx). Accounts are only
// created by the /api/auth route (email codes, Google and GitHub callbacks,
// single sign-on), which imports it. Registering twice is harmless: it's
// one slot on globalThis.

/** Runs `task` after the response, or now when there's no request. */
function afterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    // No request to wait for (scripts, tests): run now.
    void task();
  }
}

/**
 * The welcome email, after the response. The sign-up's country (Pro's
 * currency in it) is read now: the request's headers don't outlive it.
 * Never throws.
 */
function welcomeNewUser(signUp: NewUserSignUp): void {
  const country = signUp.headers?.get("x-vercel-ip-country") ?? null;
  afterResponse(async () => {
    try {
      const outcome = await sendWelcomeEmail({
        userId: signUp.userId,
        country,
      });
      if (outcome !== "sent" && outcome !== "off") {
        console.info(JSON.stringify({ event: "email.welcome", outcome }));
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "email.welcome_failed",
          error: error instanceof Error ? error.name : "unknown",
        }),
      );
    }
  });
}

/**
 * Reads what the sign-up carried now (the request's headers don't outlive
 * it) and records it after the response, so the sign-up never waits on it.
 * The welcome email goes out the same way. Never throws.
 */
export function recordNewUserSignUp(signUp: NewUserSignUp): void {
  welcomeNewUser(signUp);
  const referral = signUpReferralTask(signUp);
  const landing = signUpLandingOf(signUp);
  if (!(referral || landing)) return;
  const task = async () => {
    try {
      const credited = referral ? await referral() : null;
      await recordAcquisition({
        userId: signUp.userId,
        landing,
        affiliate: credited?.status === "attributed",
      });
    } catch (error) {
      // Both steps catch their own failures; this is a last guard.
      console.error(
        JSON.stringify({
          event: "analytics.new_user_failed",
          error: error instanceof Error ? error.name : "unknown",
        }),
      );
    }
  };
  afterResponse(task);
}

registerNewUserRecorder(recordNewUserSignUp);
