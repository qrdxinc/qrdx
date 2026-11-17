import "server-only";
import { database } from "@repo/database";
import {
  type AuthPlanLimits,
  type PlanTier,
  planLimitsFor,
} from "./plan-limits";
import { rolesInField } from "./workspace-role-rules";

// Keep in sync with apps/app/lib/subscription.ts: Polar keeps a subscription
// "active" until a cancellation takes effect at period end.
export const ENTITLED_SUBSCRIPTION_STATUSES = ["active", "trialing"];

export type WorkspacePlanTier = PlanTier;

// Business products are the env ids; any other entitled product counts as Pro
// (apps/app/lib/plans.ts planForSubscriptionProduct).
const BUSINESS_PRODUCT_IDS = new Set(
  [
    process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID,
    process.env.NEXT_PUBLIC_QRDX_BUSINESS_YEARLY_PRODUCT_ID,
  ].filter(Boolean)
);

// The roles that pay for a workspace (PLAN_ROLES in apps/app/lib/permissions.ts).
const PLAN_ROLES = new Set(["owner", "billing"]);

/** The best plan among these people's entitled subscriptions. */
async function bestPlanOf(userIds: string[]): Promise<WorkspacePlanTier> {
  if (userIds.length === 0) return "free";
  const subscriptions = await database.query.subscription.findMany({
    columns: { productId: true },
    where: (table, { and, inArray }) =>
      and(
        inArray(table.userId, userIds),
        inArray(table.status, ENTITLED_SUBSCRIPTION_STATUSES)
      ),
  });
  if (subscriptions.length === 0) return "free";
  return subscriptions.some((s) => BUSINESS_PRODUCT_IDS.has(s.productId))
    ? "business"
    : "pro";
}

/**
 * A workspace's plan: the best entitled subscription among its owners and
 * billing members, like getOwnerPlanForOrganization in apps/app/lib/plans.ts.
 */
export async function workspacePlanTier(
  organizationId: string
): Promise<WorkspacePlanTier> {
  const payers = await database.query.member.findMany({
    columns: { userId: true, role: true },
    where: (table, { and, eq, like, or }) =>
      and(
        eq(table.organizationId, organizationId),
        or(like(table.role, "%owner%"), like(table.role, "%billing%"))
      ),
  });
  const payerIds = payers
    .filter((m) => rolesInField(m.role).some((role) => PLAN_ROLES.has(role)))
    .map((m) => m.userId);
  return bestPlanOf(payerIds);
}

/**
 * The limits of a workspace's plan (./plan-limits.ts): seats (./server.ts),
 * workspace SSO (./ee/sso.ts) and required two-step verification
 * (./workspace-two-factor.ts) are decided by them.
 */
export async function workspacePlanLimits(
  organizationId: string
): Promise<AuthPlanLimits> {
  return planLimitsFor(await workspacePlanTier(organizationId));
}

/**
 * The limits of a person's own plan, from their entitled subscriptions.
 * Whether they may create more workspaces (`teams`) is decided by it.
 */
export async function userPlanLimits(userId: string): Promise<AuthPlanLimits> {
  return planLimitsFor(await bestPlanOf([userId]));
}
