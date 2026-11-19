import "server-only";

import { database as db, qrScan, user } from "@repo/database";
import { baseUrl } from "@repo/email/origin";
import { isReservedEmailAddress } from "@repo/email/reserved-address";
import { FirstScanEmail } from "@repo/email/templates/first-scan";
import { codeLabel } from "@repo/email/templates/parts";
import { DEFAULT_LOCALE, isLocale } from "@repo/i18n/config";
import { and, eq, gte, lt, or } from "drizzle-orm";
import type { RecordedScan, ScannedCode } from "@/lib/events/emit";
import { SCAN_MILESTONES } from "@/lib/events/types";
import { teamNotesUnsubscribeUrl } from "@/lib/events/unsubscribe";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { emailIntl } from "@/lib/i18n/email";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { workspaceLink } from "@/lib/workspace-paths";
import { workspaceSlug } from "@/lib/workspaces";
import { personalSender } from "./personal-sender";
import { sendEmail } from "./send";
import { wantsTeamNotes } from "./team-notes";
import { isPortalClient } from "./welcome";

// Free's one first-scan email per code (owner decision, 19 Nov): "your code
// got its first scan", to the person who made the code, with one line on
// what Pro adds. Pro and Business have their own first-scan alert (scan
// milestone 1, on by default; lib/events/types.ts DEFAULT_EMAIL_EVENTS), so
// this never goes to a workspace whose plan has email alerts, and nobody
// gets both for one code: both go on the same scan, the code's first real
// one (firstScanStatus), and lib/events/emit.ts decides which from one read
// of the plan, so an upgrade or downgrade can't send both.
//
// It's one of the notes from the QRdx team (./team-notes.ts): no row
// needed, on by default, and the one-click link in it (or Settings >
// Notifications) turns those off. So it only goes out where they exist
// (the teamNotes feature: qrdx.dev with email), never from a self-hosted
// server. Like the welcome, it comes from EMAIL_FROM_PERSONAL with replies
// to it (the setting says replying reaches a person), and isn't sent
// without that sender.
//
// Only codes made here from FIRST_SCAN_EMAIL_SINCE on: an older code that
// was never scanned isn't news, and a code brought in by a CSV import or
// from another provider (created_via import or migrate) was likely being
// scanned already.
//
// The maker's own test scan: nothing tells who scanned (the phone that
// scans is rarely signed in, and making a code stores no visitor hash), so
// any scan in the first FIRST_SCAN_TEST_MINUTES after the code was made
// counts as the maker trying it. The email goes with the first scan after
// that. Each scan checks this only while the code has at most
// FIRST_SCAN_CHECK_LIMIT scans, so busy codes cost nothing. Only scans
// stored strictly before this one count as earlier (the time, then the id),
// so of two scans at once exactly one sends, and the idempotency key
// first-scan:<codeId> covers a retry. A send that fails isn't tried again
// on a later scan (that one sees an earlier real scan); it's logged with
// the code's id.

/** Scans this soon after the code was made are the maker's test. */
export const FIRST_SCAN_TEST_MINUTES = 3;

/** Past this many scans, a code's first real scan is long gone. */
export const FIRST_SCAN_CHECK_LIMIT = 25;

/** Codes made before this (the day the email shipped) never get it. */
export const FIRST_SCAN_EMAIL_SINCE = new Date("2026-11-19T00:00:00Z");

/** Where a code came from elsewhere, already printed and scanned. */
const BROUGHT_IN = new Set(["import", "migrate"]);

export type FreeFirstScanOutcome =
  | "sent"
  | "not_first"
  | "test_scan"
  | "old_code"
  | "imported"
  | "off"
  | "no_personal_sender"
  | "paid_plan"
  | "not_found"
  | "opted_out"
  | "banned"
  | "reserved_address"
  | "portal_client"
  | "failed";

/** The milestones after the first, as Pro emails them: "10", "100", "500". */
const nextMilestones = (locale: string) =>
  SCAN_MILESTONES.slice(1, 4).map((count) =>
    new Intl.NumberFormat(locale).format(count),
  ) as [string, string, string];

/**
 * Whether a scan stored before this one (earlier, or at the same moment
 * with a smaller id) came after the code's test window.
 */
async function hadRealScan(
  code: ScannedCode,
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
        or(
          lt(qrScan.scannedAt, scan.scannedAt),
          and(eq(qrScan.scannedAt, scan.scannedAt), lt(qrScan.id, scan.id)),
        ),
      ),
    )
    .limit(1);
  return Boolean(earlier);
}

export type FirstScanStatus = "first" | "test_scan" | "not_first";

/** When the maker's test window for a code ends. */
const testWindowEnd = (createdAt: Date) =>
  new Date(createdAt.getTime() + FIRST_SCAN_TEST_MINUTES * 60_000);

/**
 * Whether this scan is the code's first real one: past its test window
 * (FIRST_SCAN_TEST_MINUTES after it was made), with no scan stored before
 * it past the window. Free's first-scan email and paid plans' first-scan
 * alert email both go on it. Past FIRST_SCAN_CHECK_LIMIT scans it's
 * "not_first" without a query; a code with no creation time counts its
 * very first scan.
 */
export async function firstScanStatus(
  scan: RecordedScan,
  code: ScannedCode,
): Promise<FirstScanStatus> {
  if (!code.createdAt) return code.scanCount === 1 ? "first" : "not_first";
  if (code.scanCount > FIRST_SCAN_CHECK_LIMIT) return "not_first";
  const after = testWindowEnd(code.createdAt);
  if (scan.scannedAt < after) return "test_scan";
  return (await hadRealScan(code, scan, after)) ? "not_first" : "first";
}

let warnedNoSender = false;

const logFailure = (codeId: string, error: string) =>
  console.error(
    JSON.stringify({ event: "email.free_first_scan_failed", codeId, error }),
  );

/**
 * Sends the Free first-scan email when this is the code's first real scan.
 * Never throws: what happened is the answer.
 */
export async function sendFreeFirstScanEmail(
  scan: RecordedScan,
  code: ScannedCode,
  {
    emailAlerts,
    firstScan = () => firstScanStatus(scan, code),
  }: {
    /** Whether the plan has email alerts, as the alerts saw it (emit.ts) */
    emailAlerts?: boolean;
    /** firstScanStatus, shared with the alerts (emit.ts) */
    firstScan?: () => Promise<FirstScanStatus>;
  } = {},
): Promise<FreeFirstScanOutcome> {
  try {
    if (!code.createdAt || code.scanCount > FIRST_SCAN_CHECK_LIMIT) {
      return "not_first";
    }
    if (code.createdAt < FIRST_SCAN_EMAIL_SINCE) return "old_code";
    if (code.createdVia && BROUGHT_IN.has(code.createdVia)) return "imported";
    const after = testWindowEnd(code.createdAt);
    if (scan.scannedAt < after) return "test_scan";
    if (!isFeatureAvailable("teamNotes")) return "off";
    const sender = personalSender();
    if (!sender) {
      if (!warnedNoSender) {
        warnedNoSender = true;
        console.warn(
          JSON.stringify({
            event: "email.free_first_scan",
            outcome: "no_personal_sender",
          }),
        );
      }
      return "no_personal_sender";
    }
    const scope = { userId: code.userId, organizationId: code.organizationId };
    if (
      emailAlerts ??
      getPlanLimits(await getPlanForScope(scope)).emailAlerts
    ) {
      return "paid_plan";
    }
    if ((await firstScan()) !== "first") return "not_first";

    const [maker] = await db
      .select({
        id: user.id,
        email: user.email,
        banned: user.banned,
        banExpires: user.banExpires,
        locale: user.locale,
        teamNotes: user.teamNotes,
      })
      .from(user)
      .where(eq(user.id, code.userId))
      .limit(1);
    if (!maker) return "not_found";
    // A ban in force (lib/oauth.ts isBanActive): one that ended doesn't count.
    if (maker.banned && (!maker.banExpires || maker.banExpires > new Date())) {
      return "banned";
    }
    if (isReservedEmailAddress(maker.email)) return "reserved_address";
    if (!wantsTeamNotes(maker)) return "opted_out";
    // An agency's client: their QRdx account is the portal's, not theirs.
    if (await isPortalClient(maker.email)) return "portal_client";

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
      from: sender.from,
      replyTo: sender.address,
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
    if (result.sent) return "sent";
    // Never tried again: the next scan sees this one as the first.
    logFailure(code.id, result.code ?? result.reason);
    return "failed";
  } catch (error) {
    logFailure(code.id, error instanceof Error ? error.name : "unknown");
    return "failed";
  }
}
