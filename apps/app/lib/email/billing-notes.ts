import "server-only";

import { after } from "next/server";
import { sendNewCustomerEmail } from "./new-customer";
import { sendPaymentFailedEmail } from "./payment-failed";

// The emails the Polar webhook (app/api/webhook/polar) sends about a
// subscription it just stored, after the response so they never slow or
// fail it: the failed-payment email when the subscription changed to
// past_due (./payment-failed.tsx), and the note to a new customer when it's
// active (./new-customer.tsx, which checks it's new and goes once).

/** The subscription as the webhook stored it. */
export interface StoredSubscription {
  id: string;
  userId: string | null;
  productId: string;
  status: string;
  pastDueSince: Date | null;
  startedAt: Date;
}

export type BillingNote = "payment-failed" | "new-customer";

/**
 * Which emails a stored snapshot calls for, given the stored status before
 * it (undefined for a new row). The failed-payment email goes on the change
 * to past_due only, so a redelivered or later past_due snapshot sends none.
 */
export function billingNotesFor(
  before: { status: string } | undefined,
  stored: StoredSubscription,
): BillingNote[] {
  if (!stored.userId) return [];
  if (stored.status === "past_due") {
    return before?.status !== "past_due" && stored.pastDueSince
      ? ["payment-failed"]
      : [];
  }
  return stored.status === "active" ? ["new-customer"] : [];
}

/** Sends what billingNotesFor says, after the response. Never throws. */
export function sendBillingNotes(
  before: { status: string } | undefined,
  stored: StoredSubscription,
): void {
  const notes = billingNotesFor(before, stored);
  const userId = stored.userId;
  if (notes.length === 0 || !userId) return;
  const task = async () => {
    for (const note of notes) {
      const outcome =
        note === "payment-failed" && stored.pastDueSince
          ? await sendPaymentFailedEmail({
              subscriptionId: stored.id,
              userId,
              productId: stored.productId,
              pastDueSince: stored.pastDueSince,
            })
          : await sendNewCustomerEmail({
              subscriptionId: stored.id,
              userId,
              productId: stored.productId,
              startedAt: stored.startedAt,
            });
      // Most active snapshots are renewals and redeliveries: not news.
      if (outcome !== "not_new" && outcome !== "already") {
        console.info(
          JSON.stringify({
            event: "email.billing_note",
            note,
            subscriptionId: stored.id,
            outcome,
          }),
        );
      }
    }
  };
  try {
    after(task);
  } catch {
    // Outside a request scope.
    void task();
  }
}
