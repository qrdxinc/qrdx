import type { FeatureId } from "@repo/availability";

/**
 * The ways in the sign-in panel offers, as this deployment can run them
 * (@repo/availability: googleSignIn, githubSignIn, emailSignIn, sso).
 * Client-safe. Passkeys keep their own check (passkey-sign-in.tsx): they
 * need an account first, so they never make a panel without these usable.
 */
export interface SignInOptions {
  google: boolean;
  github: boolean;
  /** Email codes can reach the address (or the terminal, in local dev). */
  email: boolean;
  /** Workspace single sign-on (a QRdx licence key). */
  sso: boolean;
}

/** `has` is isFeatureAvailable on the server, useAvailability().has in the browser. */
export function signInOptionsFrom(
  has: (feature: FeatureId) => boolean,
): SignInOptions {
  return {
    google: has("googleSignIn"),
    github: has("githubSignIn"),
    email: has("emailSignIn"),
    sso: has("sso"),
  };
}

/** Whether anyone can sign in or make an account here, passkeys aside. */
export function offersSignIn(options: SignInOptions): boolean {
  return options.google || options.github || options.email || options.sso;
}
