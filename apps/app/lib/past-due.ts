import "server-only";

import { graceEndsAt, grantsPlan } from "@repo/auth/subscription-access";
import { database as db, subscription } from "@repo/database";
import { desc, eq } from "drizzle-orm";
import { cache } from "react";
import { type Plan, planForSubscriptionProduct } from "./plans";

// Whether the signed-in person's own subscription has a failed payment
// (Polar's past_due), for the banner in the app shell
// (components/app-shell/past-due-banner.tsx) and the plan line on Plan &
// usage. Only the person who pays sees it: their latest subscription,
// whichever workspace is open. Its plan's features keep working for 7 days
// from the failure (packages/auth/subscription-access.ts).

export interface PastDueNotice {
  /** The plan that failed to renew */
  plan: Plan;
  /** When its features stop; null when the failure's time isn't known */
  graceEndsAt: Date | null;
  /** Its features still work */
  inGrace: boolean;
}

/** The person's failed payment, or null when their latest subscription is fine. */
export const getPastDueNotice = cache(
  async (userId: string): Promise<PastDueNotice | null> => {
    const [latest] = await db
      .select({
        status: subscription.status,
        productId: subscription.productId,
        pastDueSince: subscription.pastDueSince,
      })
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .orderBy(desc(subscription.createdAt))
      .limit(1);
    if (latest?.status !== "past_due") return null;
    return {
      plan: planForSubscriptionProduct(latest.productId),
      graceEndsAt: latest.pastDueSince
        ? graceEndsAt(latest.pastDueSince)
        : null,
      inGrace: grantsPlan(latest),
    };
  },
);
