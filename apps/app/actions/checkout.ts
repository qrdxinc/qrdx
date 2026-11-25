"use server";

import { isIP } from "node:net";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { headers } from "next/headers";
import { z } from "zod";
import { recordCheckout } from "@/lib/analytics/checkouts";
import { hasAnalyticsConsent } from "@/lib/analytics/server";
import {
  type CheckoutSurface,
  parseCheckoutSurface,
} from "@/lib/checkout-surface";
import { baseUrl } from "@/lib/metadata";
import {
  BILLING_NOT_CONFIGURED_MESSAGE,
  isBillingConfigured,
  polar,
} from "@/lib/polar";
import { type BillingInterval, type PaidPlan, PRICING } from "@/lib/pricing";
import { checkoutCurrency } from "@/lib/region";
import { getCurrentUser, logError } from "@/lib/shared";
import { getMyActiveSubscription } from "@/lib/subscription";
import type { CheckoutResult } from "@/types/action-results";
import { UnauthorizedError } from "@/types/errors";
import { getOrCreateCustomer } from "./customer";

// The pricing page's paid plan buttons, through POST /api/subscription/checkout
// (app/api/subscription/checkout/route.ts), so any zone on this origin can
// start one. The result type lives in types/action-results.ts.
export type { CheckoutResult } from "@/types/action-results";

const checkoutSchema = z.object({
  plan: z.enum(["pro", "business"]),
  interval: z.enum(["month", "year"]),
});

// Each attempt creates a Polar checkout session.
const checkoutLimiter = createRateLimiter({
  limiter: slidingWindow(10, "10 m"),
});

/** The visitor's IP address as the host reports it, or undefined. */
function visitorIp(requestHeaders: Pick<Headers, "get">): string | undefined {
  const ip =
    requestHeaders.get("x-real-ip")?.trim() ||
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  return ip && isIP(ip) ? ip : undefined;
}

export async function createCheckout(input: {
  plan: PaidPlan;
  interval: BillingInterval;
  /** The button or page that started it (lib/checkout-surface.ts) */
  surface?: CheckoutSurface;
}): Promise<CheckoutResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Choose a plan and billing period.", reason: "invalid" };
  }
  const { plan, interval } = parsed.data;
  // Never the client's free text: a name off the list is "unknown", and
  // checkout goes ahead either way.
  const surface = parseCheckoutSurface(input.surface);

  // The same product for every region: each one has a USD and an INR price
  // (and a EUR one once euro prices are on).
  const productId = PRICING[plan][interval].productId;
  if (!(isBillingConfigured && productId)) {
    return { error: BILLING_NOT_CONFIGURED_MESSAGE, reason: "unavailable" };
  }

  try {
    const user = await getCurrentUser();

    const { success } = await checkoutLimiter.limit(`checkout:${user.id}`);
    if (!success) {
      return {
        error: "Too many checkout attempts. Please try again in a few minutes.",
        reason: "rate_limited",
      };
    }

    // One subscription per account; upgrades and downgrades go through the
    // billing portal so nobody pays twice.
    if (await getMyActiveSubscription(user.id)) {
      return {
        error:
          "You already have a subscription. Change your plan in the billing portal.",
        reason: "subscribed",
      };
    }

    const customer = await getOrCreateCustomer(user);
    const requestHeaders = await headers();
    const session = {
      products: [productId],
      customer_id: customer?.id,
      // Polar reads the country (billing country, tax and currency) from the
      // IP address that creates the session, which is this server's. So pass
      // the visitor's IP.
      customer_ip_address: visitorIp(requestHeaders),
      metadata: {
        plan,
        interval,
        // Which button or page led here; Polar copies the metadata onto the
        // subscription and the webhook stores it (subscription.metadata).
        surface,
        // Lets the webhook attribute subscription_activated to this user in
        // PostHog; without analytics consent it is an anonymous count.
        ...((await hasAnalyticsConsent()) ? { analytics_consent: "1" } : {}),
      },
      success_url: `${baseUrl.origin}/success?checkout_id={CHECKOUT_ID}`,
      return_url: `${baseUrl.origin}/pricing`,
    };
    // And the currency the pricing page showed for their country
    // (lib/region.ts), which Polar then charges.
    const currency = checkoutCurrency(requestHeaders);
    let checkout: { id: string; url: string };
    let charged: string | undefined = currency;
    try {
      checkout = await polar.checkouts.create({ ...session, currency });
    } catch (error) {
      if (currency === "usd") throw error;
      // A product without a price in that currency (a self-hosted setup, or
      // the EUR flag set before the EUR prices exist): don't lose the sale.
      // Polar falls back to the default currency and its checkout shows the
      // amount before anyone pays.
      logError(error as Error, {
        action: "createCheckout",
        plan,
        interval,
        currency,
      });
      checkout = await polar.checkouts.create(session);
      charged = undefined;
    }

    // Who opened which checkout, from where (lib/analytics/checkouts.ts),
    // written after the response.
    recordCheckout({
      id: checkout.id,
      userId: user.id,
      plan,
      interval,
      surface,
      currency: charged,
    });
    return { url: checkout.url };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { error: "Sign in to upgrade.", reason: "sign_in" };
    }
    logError(error as Error, { action: "createCheckout", plan, interval });
    return { error: "Failed to create checkout", reason: "failed" };
  }
}
