import "server-only";

import { SUPPORT_EMAIL } from "@repo/config";
import { abuseReport, adminAuditLog, database as db } from "@repo/database";
import { and, eq, inArray } from "drizzle-orm";
import { HttpError } from "@/lib/error-response";

/**
 * Codes among `ids` that QRdx switched off after a review: the newest of
 * these records a person leaves about the code is a moderation one.
 * - An "actioned" abuse report moderates: /admin/abuse "Disable" marks every
 *   open report actioned, and "Mark resolved" on a held code keeps it off.
 *   It dates from its createdAt (a status change has no time of its own).
 * - An admin's "qr_code.disable" audit entry moderates too: the codes and
 *   user pages (and the console's copies) switch a code off without a
 *   report.
 * - An admin's "qr_code.enable" entry (a restore, or Enable on those pages)
 *   cancels the older ones, so a code turned back on and later held by a new
 *   address is an ordinary hold again.
 * Only meaningful for codes that are off.
 */
export async function moderatedIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const [actioned, decisions] = await Promise.all([
    db
      .select({
        codeId: abuseReport.qrCodeId,
        createdAt: abuseReport.createdAt,
      })
      .from(abuseReport)
      .where(
        and(
          inArray(abuseReport.qrCodeId, ids),
          eq(abuseReport.status, "actioned"),
        ),
      ),
    db
      .select({
        codeId: adminAuditLog.targetId,
        action: adminAuditLog.action,
        createdAt: adminAuditLog.createdAt,
      })
      .from(adminAuditLog)
      .where(
        and(
          eq(adminAuditLog.targetType, "qr_code"),
          inArray(adminAuditLog.targetId, ids),
          inArray(adminAuditLog.action, ["qr_code.disable", "qr_code.enable"]),
        ),
      ),
  ]);
  // Each code's newest record: moderated, or turned back on.
  const newest = new Map<string, { at: number; moderated: boolean }>();
  const note = (codeId: string | null, at: Date, moderated: boolean) => {
    if (!codeId) return;
    const time = new Date(at).getTime();
    const seen = newest.get(codeId);
    // On a tie the moderation wins.
    if (!seen || time > seen.at || (time === seen.at && moderated)) {
      newest.set(codeId, { at: time, moderated });
    }
  };
  for (const report of actioned) note(report.codeId, report.createdAt, true);
  for (const entry of decisions) {
    note(entry.codeId, entry.createdAt, entry.action === "qr_code.disable");
  }
  return new Set(
    [...newest].flatMap(([codeId, { moderated }]) =>
      moderated ? [codeId] : [],
    ),
  );
}

/**
 * Codes among `ids` held for a safety check: a new account's code saved
 * switched off with an open "auto-hold" report (lib/safety/velocity.ts
 * writeHoldReports). An admin's decision closes the report: "dismissed" when
 * the code is turned back on, "actioned" when it's kept off, so a code
 * that's off without an open hold was switched off by moderation. A code
 * QRdx switched off after a review (moderatedIds) is never one, even when
 * an address changed since filed a newer hold.
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
  const held = new Set(
    rows.flatMap((row) => (row.qrCodeId ? [row.qrCodeId] : [])),
  );
  if (held.size === 0) return held;
  const moderated = await moderatedIds([...held]);
  return new Set([...held].filter((id) => !moderated.has(id)));
}

/**
 * Owners can't point a code QRdx switched off after a review anywhere new: a
 * new destination, fallback or routing address (screenUrlChange), another
 * type, or an older version. A new address would file a fresh safety hold,
 * and approving that hold would turn the moderated code back on. Removing
 * rules or a fallback, UTM and design edits still save.
 */
export async function assertNotModerated(code: {
  id: string;
  isActive: boolean;
}): Promise<void> {
  if (code.isActive) return;
  if (!(await moderatedIds([code.id])).has(code.id)) return;
  throw new HttpError(
    403,
    "FORBIDDEN",
    `This code was switched off by QRdx after a review, so it can't be pointed anywhere new. Contact ${SUPPORT_EMAIL}.`,
  );
}
