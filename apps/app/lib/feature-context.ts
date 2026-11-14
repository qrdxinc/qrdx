import "server-only";

import type { FeatureContext } from "@repo/availability";
import { env } from "@/env";

/**
 * The server environment as the feature rules read it (names only; values
 * never leave the server). Fixed for the life of the process, so pages that
 * are prerendered pick up a change on the next deploy. Its own module so
 * lib/plans.ts can read the rules without lib/feature-availability.ts.
 */
export function featureContext(): FeatureContext {
  return {
    // The app's variables and the packages' it extends: among them
    // BETTER_AUTH_URL (passkeys) and QRDX_EE_LICENSE (ee/ features) from
    // @repo/auth, and the app URL and VERCEL_PROJECT_PRODUCTION_URL (where
    // the affiliate program runs) from @repo/next-config.
    env: { ...(env as Readonly<Record<string, string | undefined>>) },
    onVercel: Boolean(process.env.VERCEL),
    production: process.env.NODE_ENV === "production",
  };
}
