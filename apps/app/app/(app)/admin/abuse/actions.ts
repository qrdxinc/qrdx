"use server";

import { abuseReport, database as db, qrCode } from "@repo/database";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { noteDynamicCodesCreated } from "@/lib/invites/qualify";
import { ABUSE_REPORT_STATUSES } from "@/lib/safety/abuse-reasons";
import { moderatedIds } from "@/lib/safety/holds";
import {
  type AdminActionResult,
  adminError,
  runAdminAction,
} from "../_lib/action";
import {
  blockReportedFile,
  findAbuseReport as findReport,
} from "../_lib/operations";
import { adminId, optionalReason } from "../_lib/rules";
import { blockFileSchema as fileSchema } from "../_lib/schemas";

const statusSchema = z.object({
  reportId: adminId,
  status: z.enum(ABUSE_REPORT_STATUSES),
  reason: optionalReason,
});
const codeSchema = z.object({ reportId: adminId, reason: optionalReason });
const restoreSchema = codeSchema
  .extend({ override: z.boolean().optional() })
  .refine((input) => !input.override || (input.reason?.length ?? 0) >= 3, {
    message:
      "Add a reason (at least 3 characters) to turn a moderated code back on.",
    path: ["reason"],
  });

/** Marks a report actioned, dismissed or open again. */
export async function setAbuseReportStatusAction(
  input: z.input<typeof statusSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "abuse_report.status", schema: statusSchema },
    input,
    async (_admin, { reportId, status }) => {
      const report = await findReport(reportId);
      if (report.status === status) return null;
      await db
        .update(abuseReport)
        .set({ status })
        .where(eq(abuseReport.id, reportId));
      return {
        audit: {
          targetType: "abuse_report",
          targetId: reportId,
          metadata: {
            from: report.status,
            to: status,
            qrCodeId: report.qrCodeId,
          },
        },
      };
    },
  );
}

/**
 * Turns the reported code off (it shows "no longer active"; the owner can't
 * turn it back on) and resolves every open report about it.
 */
export async function disableReportedCodeAction(
  input: z.input<typeof codeSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "qr_code.disable", schema: codeSchema },
    input,
    async (_admin, { reportId }) => {
      const report = await findReport(reportId);
      if (!report.qrCodeId) {
        throw adminError("This report isn't linked to a code");
      }
      const [code] = await db
        .update(qrCode)
        .set({ isActive: false })
        .where(eq(qrCode.id, report.qrCodeId))
        .returning({
          slug: qrCode.slug,
          destinationUrl: qrCode.destinationUrl,
          userId: qrCode.userId,
        });
      if (!code) throw adminError("QR code not found", 404);

      await db
        .update(abuseReport)
        .set({ status: "actioned" })
        .where(
          and(
            eq(abuseReport.qrCodeId, report.qrCodeId),
            eq(abuseReport.status, "open"),
          ),
        );
      return {
        audit: {
          targetType: "qr_code",
          targetId: report.qrCodeId,
          subjectUserId: code.userId,
          metadata: {
            slug: code.slug,
            destinationUrl: code.destinationUrl,
            ownerId: code.userId,
            abuseReportId: reportId,
          },
        },
      };
    },
  );
}

/**
 * Turns a reported or held code back on (e.g. a held destination that is
 * fine) and dismisses the report. A code QRdx switched off after a review
 * (lib/safety/holds.ts moderatedIds) stays off unless the admin overrides,
 * with a reason: approving a hold its owner filed since, by changing its
 * address, mustn't undo the review.
 */
export async function restoreReportedCodeAction(
  input: z.input<typeof restoreSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "qr_code.enable", schema: restoreSchema },
    input,
    async (_admin, { reportId, override }) => {
      const report = await findReport(reportId);
      if (!report.qrCodeId) {
        throw adminError("This report isn't linked to a code");
      }
      const moderated = (await moderatedIds([report.qrCodeId])).has(
        report.qrCodeId,
      );
      if (moderated && !override) {
        throw adminError(
          "QRdx switched this code off after a review (an actioned report or an admin's Disable). Reload the page to turn it back on with an override and a reason.",
          409,
        );
      }
      const [code] = await db
        .update(qrCode)
        .set({ isActive: true })
        .where(eq(qrCode.id, report.qrCodeId))
        .returning({
          slug: qrCode.slug,
          destinationUrl: qrCode.destinationUrl,
          userId: qrCode.userId,
        });
      if (!code) throw adminError("QR code not found", 404);

      await db
        .update(abuseReport)
        .set({ status: "dismissed" })
        .where(eq(abuseReport.id, reportId));
      // Switched back on: it can now be its owner's first code for a
      // friend's invite (lib/invites/qualify.ts), after the response.
      noteDynamicCodesCreated(code.userId);
      return {
        audit: {
          targetType: "qr_code",
          targetId: report.qrCodeId,
          subjectUserId: code.userId,
          metadata: {
            slug: code.slug,
            destinationUrl: code.destinationUrl,
            ownerId: code.userId,
            abuseReportId: reportId,
            ...(moderated && { override: true }),
          },
        },
      };
    },
  );
}

/**
 * Blocks a file named by the report (takedown); the report is actioned.
 * setFileBlocked writes its own "file.block" audit entry; this one records
 * the report it came from (../_lib/operations.ts).
 */
export async function blockReportedFileAction(
  input: z.input<typeof fileSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "abuse_report.block_file", schema: fileSchema },
    input,
    (admin, data) => blockReportedFile(admin, data),
  );
}
