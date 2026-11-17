import { safeNextPath } from "@/lib/safe-redirect";
import { isSocialSignIn, type SocialSignIn } from "./error-message";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/**
 * How the page opens: "signup" (?mode=signup) shows the panel as the
 * dialog's sign-up, for links that ask a visitor to make an account (the
 * marketing site's "Use template", which can't open the dialog). Any other
 * value, or none, is a sign-in. The same panel either way: Google, GitHub
 * and an email code sign in or create the account alike.
 */
export type SignInPageMode = "signin" | "signup";

/** The query /sign-in acts on, after the `next` safety check. */
export interface SignInPageParams {
  /** Same-site path to open after sign-in (/dashboard when missing or unsafe). */
  next: string;
  /** Arrived from /sign-out: say so. */
  signedOut: boolean;
  /** A sign-in that failed on the way back (?error=, ./error-message.ts). */
  error: string | null;
  /** It was Google or GitHub (?via=); otherwise workspace single sign-on. */
  via: SocialSignIn | null;
  /** Sign-up only for exactly ?mode=signup; sign-in otherwise. */
  mode: SignInPageMode;
}

export function readSignInParams(params: SearchParams): SignInPageParams {
  const via = first(params.via);
  return {
    next: safeNextPath(first(params.next)),
    signedOut: first(params.signedOut) === "1",
    error: first(params.error) ?? null,
    via: isSocialSignIn(via) ? via : null,
    mode: first(params.mode) === "signup" ? "signup" : "signin",
  };
}
