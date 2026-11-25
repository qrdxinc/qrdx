import { Webhooks } from "@polar-sh/nextjs";
import { database as db, subscription } from "@repo/database";
import { eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import {
  plansBeforeBillingChange,
  recordPlanChanges,
} from "@/ee/audit-log/plan-change";
import { env } from "@/env";
import { handleAffiliateWebhook } from "@/lib/affiliates/commissions";
import { trackSubscriptionEvent } from "@/lib/analytics/subscription-events";
import { sendBillingNotes } from "@/lib/email/billing-notes";

function safeParseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  return new Date(value);
}

type WebhooksConfig = Parameters<typeof Webhooks>[0];

// Payload fields are snake_case since @polar-sh/sdk 1.0.
const onPayload: WebhooksConfig["onPayload"] = async ({ data, type }) => {
  if (
    type === "subscription.created" ||
    type === "subscription.active" ||
    type === "subscription.canceled" ||
    type === "subscription.revoked" ||
    type === "subscription.uncanceled" ||
    type === "subscription.updated"
  ) {
    try {
      const userId = data.customer?.external_id;
      // The stored status before this snapshot: a change to past_due starts
      // the 7 days paid features keep working (past_due_since,
      // packages/auth/subscription-access.ts) and sends one email.
      const [before] = await db
        .select({
          status: subscription.status,
          pastDueSince: subscription.pastDueSince,
        })
        .from(subscription)
        .where(eq(subscription.id, data.id))
        .limit(1);
      const modifiedAt = safeParseDate(data.modified_at);
      // Kept while it stays past_due; a row that was past_due before the
      // time was stored keeps none (no grace). Cleared once it isn't.
      const pastDueSince =
        data.status !== "past_due"
          ? null
          : before?.status === "past_due"
            ? before.pastDueSince
            : (modifiedAt ?? new Date());

      const subscriptionData = {
        id: data.id,
        createdAt: new Date(data.created_at),
        modifiedAt,
        amount: data.amount,
        currency: data.currency,
        recurringInterval: data.recurring_interval,
        status: data.status,
        currentPeriodStart:
          safeParseDate(data.current_period_start) || new Date(),
        currentPeriodEnd: safeParseDate(data.current_period_end) || new Date(),
        cancelAtPeriodEnd: data.cancel_at_period_end || false,
        canceledAt: safeParseDate(data.canceled_at),
        startedAt: safeParseDate(data.started_at) || new Date(),
        endsAt: safeParseDate(data.ends_at),
        endedAt: safeParseDate(data.ended_at),
        customerId: data.customer_id,
        productId: data.product_id,
        discountId: data.discount_id || null,
        checkoutId: data.checkout_id || "",
        customerCancellationReason: data.customer_cancellation_reason || null,
        customerCancellationComment: data.customer_cancellation_comment || null,
        // What checkout put there (plan, interval, surface: the button or
        // page that led to it), which Polar copies onto the subscription.
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        customFieldData: data.custom_field_data
          ? JSON.stringify(data.custom_field_data)
          : null,
        userId: userId as string | null,
        pastDueSince,
      };

      const plansBefore = await plansBeforeBillingChange(userId);
      const [stored] = await db
        .insert(subscription)
        .values(subscriptionData)
        .onConflictDoUpdate({
          target: subscription.id,
          // Webhooks can arrive out of order or be redelivered: never let an
          // older snapshot overwrite a newer one.
          setWhere: sql`coalesce(excluded.modified_at, excluded.created_at) >= coalesce(${subscription.modifiedAt}, ${subscription.createdAt})`,
          set: {
            modifiedAt: subscriptionData.modifiedAt,
            amount: subscriptionData.amount,
            currency: subscriptionData.currency,
            recurringInterval: subscriptionData.recurringInterval,
            status: subscriptionData.status,
            currentPeriodStart: subscriptionData.currentPeriodStart,
            currentPeriodEnd: subscriptionData.currentPeriodEnd,
            cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd,
            canceledAt: subscriptionData.canceledAt,
            startedAt: subscriptionData.startedAt,
            endsAt: subscriptionData.endsAt,
            endedAt: subscriptionData.endedAt,
            customerId: subscriptionData.customerId,
            productId: subscriptionData.productId,
            discountId: subscriptionData.discountId,
            checkoutId: subscriptionData.checkoutId,
            customerCancellationReason:
              subscriptionData.customerCancellationReason,
            customerCancellationComment:
              subscriptionData.customerCancellationComment,
            metadata: subscriptionData.metadata,
            customFieldData: subscriptionData.customFieldData,
            userId: sql`coalesce(excluded.user_id, ${subscription.userId})`,
            pastDueSince: subscriptionData.pastDueSince,
          },
        })
        // Nothing when an older snapshot was left alone.
        .returning({
          userId: subscription.userId,
          productId: subscription.productId,
          status: subscription.status,
          pastDueSince: subscription.pastDueSince,
          startedAt: subscription.startedAt,
        });
      await recordPlanChanges(userId, plansBefore);
      // The failed-payment email or the new-customer note, after the
      // response (lib/email/billing-notes.ts).
      if (stored) sendBillingNotes(before, { id: data.id, ...stored });

      // subscription_activated and subscription_canceled, after the response
      // (lib/analytics/subscription-events.ts).
      trackSubscriptionEvent(type, data);

      console.log("Processed Polar webhook:", {
        type,
        subscriptionId: subscriptionData.id,
        status: subscriptionData.status,
      });
    } catch (error) {
      console.error("Error processing subscription webhook:", error);
      // Rethrow so the handler returns 5xx and Polar retries the delivery.
      throw error;
    }
  }
};

// Affiliate commissions (lib/affiliates/commissions.ts: order.paid,
// order.refunded, refund.created, refund.updated). The Webhooks wrapper has
// already verified the signature (a bad one gets a 403 before this runs),
// and the billing state above is saved first: if that throws, nothing here
// runs and Polar retries the whole delivery. The affiliate step never
// fails the webhook: an error is logged and Polar still gets a 2xx.
const onPayloadWithAffiliates: WebhooksConfig["onPayload"] = async (
  payload,
) => {
  await onPayload?.(payload);
  try {
    await handleAffiliateWebhook(payload);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "affiliates.webhook_failed",
        type: payload.type,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
};

const handleWebhook = env.POLAR_WEBHOOK_SECRET
  ? Webhooks({
      webhookSecret: env.POLAR_WEBHOOK_SECRET,
      onPayload: onPayloadWithAffiliates,
    })
  : null;

export async function POST(request: NextRequest) {
  if (!handleWebhook) {
    return NextResponse.json(
      { error: "Billing is not configured" },
      { status: 503 },
    );
  }

  return handleWebhook(request);
}
