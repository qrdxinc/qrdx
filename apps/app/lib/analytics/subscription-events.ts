import "server-only";

import { parseCheckoutSurface } from "@/lib/checkout-surface";
import { planForProductId } from "@/lib/pricing";
import { acquisitionProps } from "./acquisition";
import { trackServerAfter } from "./server";

// The Polar webhook's analytics (app/api/webhook/polar/route.ts): a
// subscription that became active (subscription_activated) or was canceled
// (subscription_canceled), with how the account found QRdx
// (user_acquisition, read after the response) and the surface checkout
// recorded on it. Named in PostHog only when the buyer allowed analytics at
// checkout; otherwise an anonymous count. The database stays the record of
// who pays (subscription); these are for funnels.

/** The fields of a webhook's subscription these events read. */
export interface WebhookSubscription {
  id: string;
  product_id: string;
  amount?: number | null;
  currency?: string | null;
  recurring_interval?: string | null;
  canceled_at?: string | Date | null;
  started_at?: string | Date | null;
  metadata?: Record<string, unknown> | null;
  customer?: { external_id?: string | null } | null;
}

const toDate = (value: string | Date | null | undefined): Date | undefined =>
  value ? new Date(value) : undefined;

/**
 * Sends the event a subscription webhook stands for, if any: `active`
 * → subscription_activated, `canceled` → subscription_canceled. Other
 * types send nothing. Never throws and never delays the response.
 */
export function trackSubscriptionEvent(
  type: string,
  data: WebhookSubscription,
): void {
  const userId = data.customer?.external_id ?? null;
  const plan = planForProductId(data.product_id) ?? "pro";
  // The button or page checkout recorded (actions/checkout.ts)
  const surface = parseCheckoutSurface(data.metadata?.surface);
  // Named only if the buyer allowed analytics (set at checkout).
  const distinctId = data.metadata?.analytics_consent === "1" ? userId : null;
  const channel = async () => (userId ? await acquisitionProps(userId) : {});

  if (type === "subscription.active") {
    trackServerAfter("subscription_activated", async () => ({
      props: {
        ...(await channel()),
        plan,
        interval: data.recurring_interval ?? undefined,
        surface,
        amount: data.amount ?? undefined,
        currency: data.currency?.toLowerCase() ?? undefined,
      },
      options: {
        distinctId,
        dedupeKey: data.id,
        timestamp: toDate(data.started_at),
      },
    }));
    return;
  }
  if (type === "subscription.canceled") {
    const canceledAt = toDate(data.canceled_at);
    trackServerAfter("subscription_canceled", async () => ({
      props: { ...(await channel()), plan, surface },
      options: {
        distinctId,
        // One per cancellation: canceled, uncanceled and canceled again
        // counts twice.
        dedupeKey: `${data.id}:${canceledAt?.toISOString() ?? ""}`,
        timestamp: canceledAt,
      },
    }));
  }
}
