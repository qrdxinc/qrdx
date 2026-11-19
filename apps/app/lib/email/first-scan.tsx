import "server-only";

import { database as db, qrScan, user } from "@repo/database";
import { baseUrl } from "@repo/email/origin";
import { isReservedEmailAddress } from "@repo/email/reserved-address";
import { FirstScanEmail } from "@repo/email/templates/first-scan";
import { codeLabel } from "@repo/email/templates/parts";
import { DEFAULT_LOCALE, isLocale } from "@repo/i18n/config";
import { and, eq, gte, ne } from "drizzle-orm";
import type { RecordedScan, ScannedCode } from "@/lib/events/emit";
import { SCAN_MILESTONES } from "@/lib/events/types";
import { teamNotesUnsubscribeUrl } from "@/lib/events/unsubscribe";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { emailIntl } from "@/lib/i18n/email";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { workspaceLink } from "@/lib/workspace-paths";
import { workspaceSlug } from "@/lib/workspaces";
import { sendEmail } from "./send";
import { wantsTeamNotes } from "./team-notes";

// Free's one first-scan email per code (owner decision, 19 Nov): "your code
// got its first scan", to the person who made the code, with one line on
// what Pro adds. Pro and Business keep their own alerts (scan milestones,
// form responses, code changes, the weekly digest; lib/events/notify.tsx),
// which need a notification_setting row, so this never goes to a workspace
// whose plan has email alerts: nobody gets both for one code.
//
// It's one of the notes from the QRdx team (./team-notes.ts): no row
// needed, on by default, and the one-click link in it (or Settings >
// Notifications) turns those off. So it only goes out where they exist
// (the teamNotes feature: qrdx.dev with email), never from a self-hosted
// server.
//
// The maker's own test scan: nothing tells who scanned (the phone that
// scans is rarely signed in, and making a code stores no visitor hash), so
// any scan in the first FIRST_SCAN_TEST_MINUTES after the code was made
// counts as the maker trying it. The email goes with the first scan after
// that. Each scan checks this only while the code has at most
// FIRST_SCAN_CHECK_LIMIT scans, so busy codes cost nothing. The
// idempotency key first-scan:<codeId> keeps two scans at once from sending
// it twice.

/** Scans this soon after the code was made are the maker's test. */
export const FIRST_SCAN_TEST_MINUTES = 3;

/** Past this many scans, a code's first real scan is long gone. */
export const FIRST_SCAN_CHECK_LIMIT = 25;

export type FreeFirstScanOutcome =
  | "sent"
  | "not_first"
  | "test_scan"
  | "off"
  | "paid_plan"
  | "not_found"
  | "opted_out"
  | "banned"
  | "reserved_address"
  | "failed";

/** The milestones after the first, as Pro emails them: "10", "100", "500". */
const nextMilestones = (locale: string) =>
  SCAN_MILESTONES.slice(1, 4).map((count) =>
    new Intl.NumberFormat(locale).format(count),
  ) as [string, string, string];

/** Whether an earlier scan of the code came after its test window. */
async function hadRealScan(
  code: ScannedCode & { createdAt: Date },
  scan: RecordedScan,
  after: Date,
): Promise<boolean> {
  const [earlier] = await db
    .select({ id: qrScan.id })
    .from(qrScan)
    .where(
      and(
        eq(qrScan.qrCodeId, code.id),
        gte(qrScan.scannedAt, after),
        ne(qrScan.id, scan.id),
      ),
    )
    .limit(1);
  return Boolean(earlier);
}

/**
 * Sends the Free first-scan email when this is the code's first real scan.
 * Never throws: what happened is the answer.
 */
export async function sendFreeFirstScanEmail(
  scan: RecordedScan,
  code: ScannedCode,
): Promise<FreeFirstScanOutcome> {
  try {
    if (!code.createdAt || code.scanCount > FIRST_SCAN_CHECK_LIMIT) {
      return "not_first";
    }
    const after = new Date(
      code.createdAt.getTime() + FIRST_SCAN_TEST_MINUTES * 60_000,
    );
    if (scan.scannedAt < after) return "test_scan";
    if (!isFeatureAvailable("teamNotes")) return "off";
    const scope = { userId: code.userId, organizationId: code.organizationId };
    if (getPlanLimits(await getPlanForScope(scope)).emailAlerts) {
      return "paid_plan";
    }
    if (
      await hadRealScan({ ...code, createdAt: code.createdAt }, scan, after)
    ) {
      return "not_first";
    }

    const [maker] = await db
      .select({
        id: user.id,
        email: user.email,
        banned: user.banned,
        locale: user.locale,
        teamNotes: user.teamNotes,
      })
      .from(user)
      .where(eq(user.id, code.userId))
      .limit(1);
    if (!maker) return "not_found";
    if (maker.banned) return "banned";
    if (isReservedEmailAddress(maker.email)) return "reserved_address";
    if (!wantsTeamNotes(maker)) return "opted_out";

    const intl = await emailIntl(
      isLocale(maker.locale) ? maker.locale : DEFAULT_LOCALE,
    );
    const slug = code.organizationId
      ? await workspaceSlug(code.organizationId)
      : null;
    const absolute = (path: string) => new URL(path, baseUrl).toString();
    const unsubscribeUrl = teamNotesUnsubscribeUrl(maker.id);
    const label = codeLabel(code);
    const location = [scan.city, scan.country].filter(Boolean).join(", ");
    const device = [scan.os, scan.browser].filter(Boolean).join(" · ");
    const result = await sendEmail({
      to: maker.email,
      subject: intl.t("firstScan.subject", { code: label }),
      react: (
        <FirstScanEmail
          analyticsUrl={absolute(
            workspaceLink(slug, `/codes/${encodeURIComponent(code.id)}`),
          )}
          code={code}
          device={device || null}
          free={{
            pricingUrl: absolute("/pricing?interval=month"),
            milestones: nextMilestones(intl.locale),
          }}
          intl={intl}
          location={location || null}
          scannedAt={scan.scannedAt}
          unsubscribeUrl={unsubscribeUrl}
          workspaceName=""
        />
      ),
      unsubscribeUrl,
      idempotencyKey: `first-scan:${code.id}`,
      tags: [{ name: "kind", value: "first-scan" }],
    });
    return result.sent ? "sent" : "failed";
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "email.free_first_scan_failed",
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return "failed";
  }
}
