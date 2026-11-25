import "server-only";

import { database as db, subscription, user } from "@repo/database";
import { baseUrl } from "@repo/email/origin";
import { isReservedEmailAddress } from "@repo/email/reserved-address";
import {
  NewCustomerEmail,
  type NewCustomerStep,
  newCustomerSubject,
} from "@repo/email/templates/new-customer";
import { DEFAULT_LOCALE, isLocale } from "@repo/i18n/config";
import { and, eq, ne } from "drizzle-orm";
import { env } from "@/env";
import { teamNotesUnsubscribeUrl } from "@/lib/events/unsubscribe";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { emailIntl } from "@/lib/i18n/email";
import {
  getPlanLimits,
  type Plan,
  planForSubscriptionProduct,
} from "@/lib/plans";
import { MONEY_BACK_DAYS, PLAN_NAMES } from "@/lib/pricing";
import { workspaceLink } from "@/lib/workspace-paths";
import { greetingName } from "./greeting";
import { claimLifecycleEmail, releaseLifecycleEmail } from "./lifecycle";
import { personalSender } from "./personal-sender";
import { sendEmail } from "./send";
import { wantsTeamNotes } from "./team-notes";

// The note after someone's first payment (B-06, owner decision 25 Nov
// 2026): thanks, three things to set up on the plan they bought (only what
// that plan has and this deployment offers), the money-back guarantee in
// plain words and "reply with anything". The Polar webhook
// (app/api/webhook/polar) calls it after the response whenever a
// subscription is stored as active; it goes only for a subscription that
// started in the last NEW_CUSTOMER_DAYS (not a renewal, an uncancel or a
// recovered payment) and is the account's first (not a returning
// customer), once per subscription: the lifecycle_email row (./lifecycle.ts)
// and the idempotency key new-customer:<subscriptionId>.
//
// Like the welcome email, it's a note from the QRdx team (./team-notes.ts):
// from EMAIL_FROM_PERSONAL with replies to it, which is how the money-back
// guarantee is asked for (content/legal/refunds.mdx), never to someone who
// turned them off, a banned account or a reserved test address.

/** A subscription that started longer ago than this isn't new. */
export const NEW_CUSTOMER_DAYS = 3;

export type NewCustomerOutcome =
  | "sent"
  | "not_new"
  | "returning"
  | "off"
  | "no_personal_sender"
  | "not_found"
  | "banned"
  | "reserved_address"
  | "opted_out"
  | "already"
  | "unavailable"
  | "failed";

type StepKind = NewCustomerStep["kind"];

/** What to set up first on each plan, most useful first. */
const STEP_ORDER: Record<Exclude<Plan, "free">, StepKind[]> = {
  pro: ["domain", "backHalf", "alerts", "team"],
  business: ["team", "domain", "alerts", "backHalf"],
};

/**
 * The first three things to set up on `plan` that it includes and this
 * deployment offers (custom domains need setup), with absolute links into
 * the reader's default workspace.
 */
export function newCustomerSteps(
  plan: Plan,
  absolute: (path: string) => string = (path) =>
    new URL(path, baseUrl).toString(),
): NewCustomerStep[] {
  if (plan === "free") return [];
  const limits = getPlanLimits(plan);
  const steps: NewCustomerStep[] = [];
  for (const kind of STEP_ORDER[plan]) {
    if (kind === "domain") {
      if (limits.customDomains > 0 && isFeatureAvailable("customDomains")) {
        steps.push({
          kind,
          url: absolute(workspaceLink(null, "/settings/domains")),
          count: limits.customDomains,
        });
      }
    } else if (kind === "backHalf") {
      if (limits.customSlugs) {
        steps.push({ kind, url: absolute(workspaceLink(null, "/codes")) });
      }
    } else if (kind === "alerts") {
      if (limits.emailAlerts) {
        steps.push({ kind, url: absolute("/settings/notifications") });
      }
    } else if (limits.teams && limits.teamMembers > 1) {
      steps.push({
        kind,
        url: absolute(workspaceLink(null, "/settings/team")),
        count: Number.isFinite(limits.teamMembers) ? limits.teamMembers : null,
      });
    }
  }
  return steps.slice(0, 3);
}

const DAY_MS = 24 * 60 * 60 * 1000;
let warnedNoSender = false;

/** Sends the new-customer note. Never throws: what happened is the answer. */
export async function sendNewCustomerEmail({
  subscriptionId,
  userId,
  productId,
  startedAt,
  now = new Date(),
}: {
  subscriptionId: string;
  userId: string;
  productId: string;
  startedAt: Date;
  now?: Date;
}): Promise<NewCustomerOutcome> {
  try {
    if (now.getTime() - startedAt.getTime() > NEW_CUSTOMER_DAYS * DAY_MS) {
      return "not_new";
    }
    if (!(isFeatureAvailable("teamNotes") && env.EMAIL_FROM)) return "off";
    const sender = personalSender();
    if (!sender) {
      if (!warnedNoSender) {
        warnedNoSender = true;
        console.warn(
          JSON.stringify({
            event: "email.new_customer",
            outcome: "no_personal_sender",
          }),
        );
      }
      return "no_personal_sender";
    }
    // Someone who paid before (another subscription) isn't a new customer.
    const [earlier] = await db
      .select({ id: subscription.id })
      .from(subscription)
      .where(
        and(
          eq(subscription.userId, userId),
          ne(subscription.id, subscriptionId),
        ),
      )
      .limit(1);
    if (earlier) return "returning";

    const [row] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        banned: user.banned,
        banExpires: user.banExpires,
        locale: user.locale,
        teamNotes: user.teamNotes,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!row) return "not_found";
    if (row.banned && (!row.banExpires || row.banExpires > new Date())) {
      return "banned";
    }
    if (isReservedEmailAddress(row.email)) return "reserved_address";
    if (!wantsTeamNotes(row)) return "opted_out";

    const claim = {
      kind: "new-customer",
      subject: subscriptionId,
      userId: row.id,
    } as const;
    const claimed = await claimLifecycleEmail(claim);
    if (claimed === null) return "unavailable";
    if (!claimed) return "already";

    try {
      const plan = planForSubscriptionProduct(productId);
      const planName = PLAN_NAMES[plan];
      const intl = await emailIntl(
        isLocale(row.locale) ? row.locale : DEFAULT_LOCALE,
      );
      const unsubscribeUrl = teamNotesUnsubscribeUrl(row.id);
      const result = await sendEmail({
        to: row.email,
        from: sender.from,
        replyTo: sender.address,
        subject: newCustomerSubject(intl, { planName }),
        react: (
          <NewCustomerEmail
            firstName={greetingName(row.name, row.email).name}
            intl={intl}
            moneyBackDays={MONEY_BACK_DAYS}
            planName={planName}
            recipient={row.email}
            senderName={sender.name}
            steps={newCustomerSteps(plan)}
            unsubscribeUrl={unsubscribeUrl}
          />
        ),
        unsubscribeUrl,
        idempotencyKey: `new-customer:${subscriptionId}`,
        tags: [{ name: "kind", value: "new-customer" }],
      });
      if (result.sent) return "sent";
      await releaseLifecycleEmail(claim);
      console.error(
        JSON.stringify({
          event: "email.new_customer_failed",
          subscriptionId,
          error: result.code ?? result.reason,
        }),
      );
      return "failed";
    } catch (error) {
      await releaseLifecycleEmail(claim);
      throw error;
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "email.new_customer_failed",
        subscriptionId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return "failed";
  }
}
