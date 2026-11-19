import "server-only";

import { database as db, notificationSetting } from "@repo/database";
import { and, eq } from "drizzle-orm";
import { getCheckoutOpen } from "@/lib/checkout-availability";
import { DEFAULT_EMAIL_EVENTS } from "@/lib/events/types";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { can } from "@/lib/permissions";
import { getPlanLimits, type Plan } from "@/lib/plans";
import { formatPrice, PRICING, type PricingCurrency } from "@/lib/pricing";
import type { ActiveScope } from "@/lib/scope";
import { type CodeLiveCard, codeLiveCard } from "./pro-moments-rules";

/**
 * Whether an owner of the workspace gets its scan emails (first scans and
 * milestones): its plan has email alerts, this server sends email, and
 * they kept the default (no email row) or chose scan milestones. For
 * /success, which says so after an upgrade.
 */
export async function ownerScanEmailsOn({
  userId,
  organizationId,
  plan,
}: {
  userId: string;
  organizationId: string;
  plan: Plan;
}): Promise<boolean> {
  if (!(getPlanLimits(plan).emailAlerts && isFeatureAvailable("email"))) {
    return false;
  }
  const [row] = await db
    .select({ events: notificationSetting.events })
    .from(notificationSetting)
    .where(
      and(
        eq(notificationSetting.userId, userId),
        eq(notificationSetting.organizationId, organizationId),
        eq(notificationSetting.channel, "email"),
      ),
    )
    .limit(1);
  const events: unknown[] = row
    ? Array.isArray(row.events)
      ? row.events
      : []
    : [...DEFAULT_EMAIL_EVENTS];
  return events.includes("scan.milestone");
}

export interface HomeProMoments {
  /** "Your code is live", with Pro's price in the visitor's currency */
  codeLive: (CodeLiveCard & { month: string; year: string }) | null;
}

/**
 * Home's plan moments for the open workspace. Never throws: Home works
 * without them.
 */
export async function getHomeProMoments(
  scope: ActiveScope,
  {
    plan,
    codesUsed,
    currency,
    locale,
  }: {
    plan: Plan;
    codesUsed: number;
    currency: PricingCurrency;
    locale: string;
  },
): Promise<HomeProMoments> {
  const canManage = can(scope.role, "billing.manage");
  const card = codeLiveCard({
    plan,
    codesUsed,
    canUpgrade: canManage,
    checkoutOpen: getCheckoutOpen().pro,
    free: getPlanLimits("free"),
    pro: getPlanLimits("pro"),
    available: {
      customDomains: isFeatureAvailable("customDomains"),
      email: isFeatureAvailable("email"),
    },
  });
  return {
    codeLive: card && {
      ...card,
      month: formatPrice(PRICING.pro.month.amounts[currency], currency, locale),
      year: formatPrice(PRICING.pro.year.amounts[currency], currency, locale),
    },
  };
}
