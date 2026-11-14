// What packages/auth decides from a plan comes from the app's plan limits
// (apps/app/lib/plans.ts, the one table a self-hosted server changes): who
// may create more workspaces, seats, workspace SSO and required two-step
// verification. The plan itself is still read from subscription rows
// (./plan.ts), never from a request.
//
// The app hands its limits over when lib/plans.ts loads; instrumentation.ts
// and the auth route load it before the server takes requests. Until then
// the limits it ships with apply (SHIPPED_PLAN_LIMITS). Pure and
// client-safe.

export type PlanTier = "free" | "pro" | "business";

/** The fields of a plan's limits (apps/app/lib/plans.ts PlanLimits) read here. */
export interface AuthPlanLimits {
  /** May create more workspaces than their own */
  teams: boolean;
  /** Members per workspace, owner included */
  teamMembers: number;
  /** Workspace single sign-on (./ee/sso.ts, ./ee/sso-required.ts) */
  sso: boolean;
  /** May require two-step verification of members (./workspace-two-factor.ts) */
  requireTwoFactor: boolean;
}

export type PlanLimitsReader = (tier: PlanTier) => AuthPlanLimits;

/**
 * apps/app/lib/plans.ts's limits as it ships, used only until the app hands
 * its own over (tests/lib/self-hosted-plans.test.ts checks they match).
 * Changing plans.ts for an instance takes effect without touching these.
 */
export const SHIPPED_PLAN_LIMITS: Readonly<Record<PlanTier, AuthPlanLimits>> = {
  free: { teams: false, teamMembers: 1, sso: false, requireTwoFactor: false },
  pro: { teams: true, teamMembers: 3, sso: false, requireTwoFactor: false },
  business: {
    teams: true,
    teamMembers: Number.POSITIVE_INFINITY,
    sso: true,
    requireTwoFactor: true,
  },
};

const SLOT = Symbol.for("@repo/auth/plan-limits");
type Slot = Record<symbol, PlanLimitsReader | undefined>;

/** The app's limits by plan (apps/app/lib/plans.ts getPlanLimits). */
export function registerPlanLimits(reader: PlanLimitsReader): void {
  (globalThis as unknown as Slot)[SLOT] = reader;
}

let shippedLogged = false;

/** A plan's limits: the app's, or the shipped ones before it hands them over. */
export function planLimitsFor(tier: PlanTier): AuthPlanLimits {
  const reader = (globalThis as unknown as Slot)[SLOT];
  if (reader) return reader(tier);
  if (!shippedLogged && process.env.NODE_ENV === "production") {
    shippedLogged = true;
    console.error(
      JSON.stringify({ event: "auth.plan_limits", outcome: "shipped-limits" })
    );
  }
  return SHIPPED_PLAN_LIMITS[tier];
}
