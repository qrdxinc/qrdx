// When Home shows what a plan includes at the moment it matters: on Free,
// once a code exists, what Pro adds for a printed code. (Scan emails need no
// offer: plans with email alerts send them by default, lib/events/types.ts
// DEFAULT_EMAIL_EVENTS.) Pure, so the tests cover every case; the limits
// come in from lib/plans.ts (server-only).

import type { PlanLimits } from "@/lib/plans";
import type { Plan } from "@/lib/pricing";

export type CodeLiveFeature =
  | "customDomain"
  | "customSlug"
  | "scanEmails"
  | "linkControls"
  | "fullHistory";

export interface CodeLiveCardInput {
  plan: Plan;
  /** Active dynamic codes in the workspace */
  codesUsed: number;
  /** May change the workspace's plan (billing.manage) */
  canUpgrade: boolean;
  /** Checkout can sell Pro here (lib/checkout-availability.ts) */
  checkoutOpen: boolean;
  free: PlanLimits;
  pro: PlanLimits;
  /** Features that need setup on this deployment */
  available: { customDomains: boolean; email: boolean };
}

export interface CodeLiveCard {
  features: CodeLiveFeature[];
  /** Whole years of scan history Free shows (for "fullHistory") */
  freeHistoryYears: number;
}

/**
 * The "Your code is live" card: Free workspaces with at least one dynamic
 * code, for people who can upgrade, while checkout sells Pro. It lists only
 * what Pro adds over Free here; with nothing to list there's no card.
 */
export function codeLiveCard({
  plan,
  codesUsed,
  canUpgrade,
  checkoutOpen,
  free,
  pro,
  available,
}: CodeLiveCardInput): CodeLiveCard | null {
  if (plan !== "free" || codesUsed < 1 || !canUpgrade || !checkoutOpen) {
    return null;
  }
  const features: CodeLiveFeature[] = [];
  if (available.customDomains && pro.customDomains > free.customDomains) {
    features.push("customDomain");
  }
  if (pro.customSlugs && !free.customSlugs) features.push("customSlug");
  if (available.email && pro.emailAlerts && !free.emailAlerts) {
    features.push("scanEmails");
  }
  if (pro.linkControls && !free.linkControls) features.push("linkControls");
  const freeHistoryYears = Math.round(free.analyticsRetentionDays / 365);
  if (
    !Number.isFinite(pro.analyticsRetentionDays) &&
    Number.isFinite(free.analyticsRetentionDays) &&
    freeHistoryYears >= 1
  ) {
    features.push("fullHistory");
  }
  return features.length > 0 ? { features, freeHistoryYears } : null;
}
