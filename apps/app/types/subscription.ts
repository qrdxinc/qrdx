import type { Plan, PricingCurrency } from "@/lib/pricing";

export interface SubscriptionCheck extends SubscriptionStatus {
  canProceed: boolean;
  error?: string;
}

export interface SubscriptionStatus {
  isSubscribed: boolean;
  requestsUsed: number;
  requestsRemaining: number;
}

/** GET /api/subscription: the status, plus the visitor's own plan. */
export interface SubscriptionSummary extends SubscriptionStatus {
  /** From their entitled subscription (lib/plans.ts getPlan): what /pricing marks as theirs */
  plan: Plan;
  /**
   * The currency checkout would charge them (lib/region.ts chargedCurrency),
   * for the prices on in-app upgrade buttons.
   */
  currency: PricingCurrency;
}
