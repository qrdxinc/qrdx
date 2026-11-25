import "server-only";

import { checkoutSession, database as db } from "@repo/database";
import { after } from "next/server";
import { isMissingTableError } from "@/lib/affiliates/missing-table";
import type { CheckoutSurface } from "@/lib/checkout-surface";
import { logError } from "@/lib/log-error";
import type { BillingInterval, PaidPlan } from "@/lib/pricing";

// The checkouts the app opened (checkout_session), one row per Polar
// checkout, written once Polar has returned its address
// (actions/checkout.ts): who, which plan and period, the surface that
// started it and the currency asked for. Polar's checkout id is the row's
// id, and a payment's subscription carries it (subscription.checkout_id),
// so a checkout that was paid can be told from one that wasn't.
//
// After the response, never throwing: checkout goes ahead whatever happens
// here. Where the table doesn't exist yet, that's noted once and nothing is
// written.

export interface CheckoutRecord {
  /** Polar's checkout id */
  id: string;
  userId: string;
  plan: PaidPlan;
  interval: BillingInterval;
  surface: CheckoutSurface;
  /** The currency checkout was asked to charge ("usd"), if one was */
  currency?: string;
  now?: Date;
}

export type CheckoutRecordResult =
  | "recorded"
  | "already_recorded"
  | "missing_table"
  | "error";

let warnedMissing = false;

/** Writes one checkout. Returns when written (or skipped); never throws. */
export async function addCheckout(
  record: CheckoutRecord,
): Promise<CheckoutRecordResult> {
  try {
    const inserted = await db
      .insert(checkoutSession)
      .values({
        id: record.id,
        userId: record.userId,
        plan: record.plan,
        interval: record.interval,
        surface: record.surface,
        currency: record.currency ?? null,
        createdAt: record.now ?? new Date(),
      })
      .onConflictDoNothing({ target: checkoutSession.id })
      .returning({ id: checkoutSession.id });
    return inserted.length === 0 ? "already_recorded" : "recorded";
  } catch (error) {
    if (isMissingTableError(error)) {
      if (!warnedMissing) {
        warnedMissing = true;
        console.warn(
          "Growth analytics: checkout_session doesn't exist yet (update the database schema: the migrate service with Docker, bun run db:push otherwise). Checkouts aren't recorded until it does.",
        );
      }
      return "missing_table";
    }
    logError(error as Error, {
      action: "analytics.record_checkout",
      plan: record.plan,
      interval: record.interval,
    });
    return "error";
  }
}

/**
 * Records a checkout Polar just created, after the response so the person
 * goes on to pay without waiting on it. Never throws.
 */
export function recordCheckout(record: CheckoutRecord): void {
  const now = record.now ?? new Date();
  const task = () => addCheckout({ ...record, now });
  try {
    after(task);
  } catch {
    // No request to wait for (scripts, tests): write now.
    void task();
  }
}
