import { createPolar, type Polar } from "@polar-sh/sdk/2026-10";
import { env } from "@/env";
import { isFeatureAvailable } from "@/lib/feature-availability";

// Every call is gated on isBillingConfigured, so the empty fallback token is
// never sent. Request and response fields are snake_case since SDK 1.0.
export const polar: Polar = createPolar({
  accessToken: env.POLAR_ACCESS_TOKEN ?? "",
  environment: env.NODE_ENV === "production" ? "production" : "sandbox",
});

/**
 * Billing needs a Polar access token (the "billing" feature in
 * @repo/availability); checkout also needs a product id. Without it the
 * deployment sells no plans and every account is on Free (lib/plans.ts).
 */
export const isBillingConfigured = isFeatureAvailable("billing");

export const BILLING_NOT_CONFIGURED_MESSAGE = "Billing is not configured";
