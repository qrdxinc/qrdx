// Which Polar subscriptions grant their plan, in one light module (no
// database, no "server-only"): packages/auth reads it for seats, workspace
// SSO and more workspaces (./plan.ts), the app for everything else
// (apps/app/lib/subscription.ts), the past-due banner and the
// failed-payment email.
//
// Polar keeps a subscription "active" until a cancellation takes effect at
// period end; "canceled", "unpaid" and "incomplete*" never grant it. When a
// payment fails the subscription turns "past_due": its paid features keep
// working for PAST_DUE_GRACE_DAYS from that change (owner decision, 25 Nov
// 2026; the webhook stores when, subscription.past_due_since), then stop
// until the payment goes through. Codes keep working either way (the
// Never-Hostage Guarantee). A past_due subscription with no time stored
// (it failed before the time was kept) gets no grace.

/** Statuses that always grant the plan. */
export const ENTITLED_SUBSCRIPTION_STATUSES = ["active", "trialing"];

/** Days paid features keep working after a payment fails. */
export const PAST_DUE_GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a failed payment's grace ends and paid features stop. */
export function graceEndsAt(pastDueSince: Date): Date {
  return new Date(pastDueSince.getTime() + PAST_DUE_GRACE_DAYS * DAY_MS);
}

/**
 * A past_due subscription whose payment failed after this still grants its
 * plan (for queries: past_due_since > graceCutoff()).
 */
export function graceCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - PAST_DUE_GRACE_DAYS * DAY_MS);
}

/** Whether a subscription grants its plan at `now`. */
export function grantsPlan(
  subscription: { status: string; pastDueSince?: Date | null },
  now: Date = new Date()
): boolean {
  if (ENTITLED_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
    return true;
  }
  return (
    subscription.status === "past_due" &&
    subscription.pastDueSince != null &&
    subscription.pastDueSince > graceCutoff(now)
  );
}
