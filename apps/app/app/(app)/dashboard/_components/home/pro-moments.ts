import "server-only";

import { database as db, notificationSetting } from "@repo/database";
import { and, eq } from "drizzle-orm";
import { getCheckoutOpen } from "@/lib/checkout-availability";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { can } from "@/lib/permissions";
import { getPlanLimits, type Plan } from "@/lib/plans";
import { formatPrice, PRICING, type PricingCurrency } from "@/lib/pricing";
import type { ActiveScope } from "@/lib/scope";
import {
  type CodeLiveCard,
  codeLiveCard,
  showScanAlertsOffer,
} from "./pro-moments-rules";

/** Whether the person has an email notification row for the workspace. */
export async function hasEmailSetting(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: notificationSetting.id })
    .from(notificationSetting)
    .where(
      and(
        eq(notificationSetting.userId, userId),
        eq(notificationSetting.organizationId, organizationId),
        eq(notificationSetting.channel, "email"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** The scan-email offer for this person in a workspace on `plan`. */
export async function scanAlertsOfferFor({
  userId,
  organizationId,
  plan,
  canManage,
}: {
  userId: string;
  organizationId: string;
  plan: Plan;
  canManage: boolean;
}): Promise<boolean> {
  const emailAlerts = getPlanLimits(plan).emailAlerts;
  const emailAvailable = isFeatureAvailable("email");
  // Only ask the database when the answer can change the outcome.
  if (!(emailAlerts && emailAvailable && canManage)) return false;
  return showScanAlertsOffer({
    emailAlerts,
    emailAvailable,
    canManage,
    hasEmailSetting: await hasEmailSetting(userId, organizationId),
  });
}

export interface HomeProMoments {
  /** "Your code is live", with Pro's price in the visitor's currency */
  codeLive: (CodeLiveCard & { month: string; year: string }) | null;
  /** The one-click scan-email offer */
  scanAlerts: boolean;
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
  const scanAlerts = await scanAlertsOfferFor({
    userId: scope.userId,
    organizationId: scope.organizationId,
    plan,
    canManage,
  }).catch(() => false);
  return {
    codeLive: card && {
      ...card,
      month: formatPrice(PRICING.pro.month.amounts[currency], currency, locale),
      year: formatPrice(PRICING.pro.year.amounts[currency], currency, locale),
    },
    scanAlerts,
  };
}
