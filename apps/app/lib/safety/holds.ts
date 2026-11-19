import "server-only";

import { abuseReport, database as db } from "@repo/database";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Codes among `ids` held for a safety check: a new account's code saved
 * switched off with an open "auto-hold" report (lib/safety/velocity.ts
 * fileHoldReports). An admin's decision closes the report: "dismissed" when
 * the code is turned back on, "actioned" when it's turned off for good, so
 * a code that's off without an open hold was switched off by moderation.
 */
export async function heldForReviewIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ qrCodeId: abuseReport.qrCodeId })
    .from(abuseReport)
    .where(
      and(
        inArray(abuseReport.qrCodeId, ids),
        eq(abuseReport.reason, "auto-hold"),
        eq(abuseReport.status, "open"),
      ),
    );
  return new Set(rows.flatMap((row) => (row.qrCodeId ? [row.qrCodeId] : [])));
}
