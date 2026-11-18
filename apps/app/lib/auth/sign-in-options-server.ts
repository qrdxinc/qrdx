import "server-only";

import { isFeatureAvailable } from "@/lib/feature-availability";
import { type SignInOptions, signInOptionsFrom } from "./sign-in-options";

/**
 * The ways in this deployment offers, from the running server's environment.
 * Pages rendered per request pass this to the sign-in panel; prerendered
 * ones carry the build's answer, so the dialog asks the server
 * (app/(app)/(auth)/components/sign-in-options-action.ts).
 */
export function getSignInOptions(): SignInOptions {
  return signInOptionsFrom(isFeatureAvailable);
}
