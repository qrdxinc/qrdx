"use server";

import {
  type ConfirmationRequired,
  confirmationRequired,
} from "@/lib/account/confirmation";
import { currentSession } from "@/lib/account/confirmation-server";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { logError } from "@/lib/shared";

/** A refusal in the person's language; the page shows it as it is. */
async function refuse(
  key: "signedOut" | "failed",
): Promise<{ ok: false; error: string }> {
  const t = await getAppTranslations("app.sessionCheck.sessionCheck");
  return { ok: false, error: t(key) };
}

/**
 * The check page's question (lib/account/session-origin.ts): CONFIRMATION_
 * REQUIRED while this session is held, so useConfirmation() opens "Confirm
 * it's you" and asks again once it's answered (which lets the session go).
 */
export async function checkSession(): Promise<
  { ok: true } | ConfirmationRequired | { ok: false; error: string }
> {
  try {
    const session = await currentSession();
    if (!session) return await refuse("signedOut");
    return session.held ? confirmationRequired() : { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.checkSession" });
    return refuse("failed");
  }
}
