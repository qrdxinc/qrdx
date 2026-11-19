import "server-only";

import { SUPPORT_EMAIL } from "@repo/config";
import { abuseReport, adminAuditLog, database as db } from "@repo/database";
import { and, desc, eq, inArray } from "drizzle-orm";
import { HttpError } from "@/lib/error-response";

/**
 * Codes among `ids` that QRdx switched off after a review, by either record
 * a person leaves:
 * - an "actioned" abuse report about the code: /admin/abuse "Disable" marks
 *   every open report actioned, and "Mark resolved" on a held code keeps it
 *   off;
 * - the latest admin "Enable" or "Disable" of the code was a disable
 *   ("qr_code.disable" in the admin audit log): the codes and user pages
 *   (and the console's copies) switch a code off without a report.
 * An actioned report counts even after an admin turned the code back on, so
 * a code that's off again is never mistaken for a safety hold. Only
 * meaningful for codes that are off.
 */
export async function moderatedIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const [actioned, decisions] = await Promise.all([
    db
      .select({ qrCodeId: abuseReport.qrCodeId })
      .from(abuseReport)
      .where(
        and(
          inArray(abuseReport.qrCodeId, ids),
          eq(abuseReport.status, "actioned"),
        ),
      ),
    db
      .select({ codeId: adminAuditLog.targetId, action: adminAuditLog.action })
      .from(adminAuditLog)
      .where(
        and(
          eq(adminAuditLog.targetType, "qr_code"),
          inArray(adminAuditLog.targetId, ids),
          inArray(adminAuditLog.action, ["qr_code.disable", "qr_code.enable"]),
        ),
      )
      .orderBy(desc(adminAuditLog.createdAt)),
  ]);
  const moderated = new Set(
    actioned.flatMap((row) => (row.qrCodeId ? [row.qrCodeId] : [])),
  );
  const decided = new Set<string>();
  for (const { codeId, action } of decisions) {
    if (!codeId || decided.has(codeId)) continue;
    decided.add(codeId);
    if (action === "qr_code.disable") moderated.add(codeId);
  }
  return moderated;
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
 * Owners can't change what a code QRdx switched off after a review opens
 * (its address, fallback, routing, type or an older version): a new address
 * would file a fresh safety hold, and approving that hold would turn the
 * moderated code back on.
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
    `This code was switched off by QRdx after a review. Contact ${SUPPORT_EMAIL}.`,
  );
}
