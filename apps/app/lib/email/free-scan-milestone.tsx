import "server-only";

import { database as db, user } from "@repo/database";
import { baseUrl } from "@repo/email/origin";
import { isReservedEmailAddress } from "@repo/email/reserved-address";
import { codeLabel } from "@repo/email/templates/parts";
import { FreeScanMilestoneEmail } from "@repo/email/templates/scan-milestone";
import { DEFAULT_LOCALE, isLocale } from "@repo/i18n/config";
import { eq } from "drizzle-orm";
import { pricingHref } from "@/lib/checkout-surface";
import type { RecordedScan, ScannedCode } from "@/lib/events/emit";
import { SCAN_MILESTONES } from "@/lib/events/types";
import { teamNotesUnsubscribeUrl } from "@/lib/events/unsubscribe";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { emailIntl } from "@/lib/i18n/email";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { workspaceLink } from "@/lib/workspace-paths";
import { workspaceSlug } from "@/lib/workspaces";
import { isBroughtIn } from "./first-scan";
import { freeInvite } from "./invite-line";
import { claimLifecycleEmail, releaseLifecycleEmail } from "./lifecycle";
import { personalSender } from "./personal-sender";
import { sendEmail } from "./send";
import { wantsTeamNotes } from "./team-notes";
import { isPortalClient } from "./welcome";

// Free's one scan-milestone email (owner decision, 25 Nov 2026): when a code
// on a Free workspace reaches FREE_SCAN_MILESTONE scans, its maker hears
// about it once per account, with one plain line on Pro and the invite
// line. Pro and Business have their own milestone alerts (lib/events), so
// this never goes to a plan with email alerts, and lib/events/emit.ts
// decides that from the same read of the plan.
//
// Each scan sees its own count after the increment, so only the scan that
// makes it exactly FREE_SCAN_MILESTONE asks: a code already past it when
// this shipped never does. A code brought in from a CSV or another provider
// (created_via import or migrate) was likely scanned elsewhere already, so
// its count here isn't news and it's skipped. Once per account: the
// lifecycle_email row (./lifecycle.ts, subject = the maker) and the
// idempotency key free-scan-milestone:<userId>; a send that fails gives
// the claim back, for the account's next code to reach the milestone.
//
// Like the first-scan email, it's a note from the QRdx team
// (./team-notes.ts), from EMAIL_FROM_PERSONAL with replies to it.

/** The scan count Free's one milestone email goes at. */
export const FREE_SCAN_MILESTONE = 100;

export type FreeScanMilestoneOutcome =
  | "sent"
  | "not_milestone"
  | "imported"
  | "off"
  | "no_personal_sender"
  | "paid_plan"
  | "not_found"
  | "banned"
  | "reserved_address"
  | "opted_out"
  | "portal_client"
  | "already"
  | "unavailable"
  | "failed";

/** The milestones Pro emails at after this one: "500", "1,000". */
const nextMilestones = (locale: string) => {
  const after = SCAN_MILESTONES.filter((count) => count > FREE_SCAN_MILESTONE);
  return after
    .slice(0, 2)
    .map((count) => new Intl.NumberFormat(locale).format(count)) as [
    string,
    string,
  ];
};

let warnedNoSender = false;

const logFailure = (codeId: string, error: string) =>
  console.error(
    JSON.stringify({ event: "email.free_scan_milestone_failed", codeId, error }),
  );

/**
 * Sends Free's milestone email when this scan brings the code to
 * FREE_SCAN_MILESTONE. Never throws: what happened is the answer.
 */
export async function sendFreeScanMilestoneEmail(
  _scan: RecordedScan,
  code: ScannedCode,
  {
    emailAlerts,
  }: {
    /** Whether the plan has email alerts, as the alerts saw it (emit.ts) */
    emailAlerts?: boolean;
  } = {},
): Promise<FreeScanMilestoneOutcome> {
  try {
    if (code.scanCount !== FREE_SCAN_MILESTONE) return "not_milestone";
    if (isBroughtIn(code.createdVia)) return "imported";
    if (!isFeatureAvailable("teamNotes")) return "off";
    const sender = personalSender();
    if (!sender) {
      if (!warnedNoSender) {
        warnedNoSender = true;
        console.warn(
          JSON.stringify({
            event: "email.free_scan_milestone",
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

    const claim = {
      kind: "free-scan-milestone",
      subject: maker.id,
      userId: maker.id,
    } as const;
    const claimed = await claimLifecycleEmail(claim);
    if (claimed === null) return "unavailable";
    if (!claimed) return "already";

    try {
      const intl = await emailIntl(
        isLocale(maker.locale) ? maker.locale : DEFAULT_LOCALE,
      );
      const slug = code.organizationId
        ? await workspaceSlug(code.organizationId)
        : null;
      const absolute = (path: string) => new URL(path, baseUrl).toString();
      const unsubscribeUrl = teamNotesUnsubscribeUrl(maker.id);
      const result = await sendEmail({
        to: maker.email,
        from: sender.from,
        replyTo: sender.address,
        subject: intl.t("scanMilestone.reached", {
          code: codeLabel(code),
          count: FREE_SCAN_MILESTONE,
        }),
        react: (
          <FreeScanMilestoneEmail
            analyticsUrl={absolute(
              workspaceLink(slug, `/codes/${encodeURIComponent(code.id)}`),
            )}
            code={code}
            free={{
              pricingUrl: absolute(
                pricingHref("scan_milestone_email", "month"),
              ),
              milestones: nextMilestones(intl.locale),
            }}
            intl={intl}
            invite={await freeInvite(maker.id)}
            milestone={FREE_SCAN_MILESTONE}
            recipient={maker.email}
            unsubscribeUrl={unsubscribeUrl}
            workspaceName=""
          />
        ),
        unsubscribeUrl,
        idempotencyKey: `free-scan-milestone:${maker.id}`,
        tags: [{ name: "kind", value: "free-scan-milestone" }],
      });
      if (result.sent) return "sent";
      await releaseLifecycleEmail(claim);
      logFailure(code.id, result.code ?? result.reason);
      return "failed";
    } catch (error) {
      await releaseLifecycleEmail(claim);
      throw error;
    }
  } catch (error) {
    logFailure(code.id, error instanceof Error ? error.name : "unknown");
    return "failed";
  }
}
