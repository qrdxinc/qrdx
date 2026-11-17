import "server-only";

import {
  eeLicenseChangesAt,
  eeLicensedFeatures,
  eeLicenseState,
} from "@repo/auth/license";
import type { FeatureContext } from "@repo/availability";
import { env } from "@/env";

let cached: { context: FeatureContext; until: number } | null = null;

/**
 * The server environment as the feature rules read it (names only; values
 * never leave the server), with the ee features the licence key turns on
 * (packages/auth/ee/license.ts checks it offline). The environment is fixed
 * for the life of the process, so pages that are prerendered pick up a change
 * on the next deploy; the licence part changes on its own when the key
 * expires and when its grace period ends, and the same object is returned
 * until then. Its own module so lib/plans.ts can read the rules without
 * lib/feature-availability.ts.
 */
export function featureContext(): FeatureContext {
  const now = Date.now();
  if (cached && now < cached.until) return cached.context;
  const values = env as Readonly<Record<string, string | undefined>>;
  const licence = eeLicenseState(values, new Date(now));
  cached = {
    context: {
      // The app's variables and the packages' it extends: among them
      // BETTER_AUTH_URL (passkeys) and QRDX_EE_LICENSE (ee/ features) from
      // @repo/auth, and the app URL and VERCEL_PROJECT_PRODUCTION_URL (where
      // the affiliate program runs) from @repo/next-config.
      env: { ...values },
      onVercel: Boolean(process.env.VERCEL),
      production: process.env.NODE_ENV === "production",
      eeFeatures: eeLicensedFeatures(licence),
    },
    until: eeLicenseChangesAt(licence),
  };
  return cached.context;
}
