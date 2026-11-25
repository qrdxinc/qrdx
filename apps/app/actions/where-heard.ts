"use server";

import { auth } from "@repo/auth/server";
import { database as db, userAcquisition } from "@repo/database";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { isMissingSchemaError } from "@/lib/community/tables";
import { logError } from "@/lib/shared";
import { NO_TRACKED_CHANNEL, parseWhereHeard } from "@/lib/where-heard";

export type SaveWhereHeardResult = { ok: true } | { ok: false };

/**
 * Home's "Where did you first hear about QRdx?" (lib/where-heard.ts): the
 * signed-in person's answer goes on their user_acquisition row, next to the
 * channel their sign-up recorded. An account whose sign-up carried nothing
 * gets a row for the answer alone, with channel "unknown". Answering again
 * replaces the answer. Until the columns exist (the SQL in the pull request
 * that added them), nothing is written and it says so quietly.
 */
export async function saveWhereHeard(
  answer: unknown,
  text: unknown,
): Promise<SaveWhereHeardResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) return { ok: false };

  const parsed = parseWhereHeard(answer, text);
  if (!parsed) return { ok: false };

  try {
    await db
      .insert(userAcquisition)
      .values({
        userId,
        // Not a channel this app works out (ACQUISITION_CHANNELS): the
        // sign-up carried nothing, as for an account with no row.
        channel: sql`${NO_TRACKED_CHANNEL}`,
        selfReported: parsed.answer,
        selfReportedText: parsed.text,
      })
      .onConflictDoUpdate({
        target: userAcquisition.userId,
        set: {
          selfReported: parsed.answer,
          selfReportedText: parsed.text,
        },
      });
    return { ok: true };
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      logError(error as Error, { action: "whereHeard.save" });
    }
    return { ok: false };
  }
}
