import { authClient } from "@repo/auth/client";
import { emailDomain } from "@repo/auth/sso-rules";
import {
  type SignInErrorTranslator,
  ssoSignInErrorMessage,
} from "@/ee/sso/messages";
import { signInPath } from "@/lib/safe-redirect";

/**
 * Starts an SSO sign-in: the work email finds the company's identity
 * provider (packages/auth/ee/sso.ts), then the browser goes there. Failures
 * on the way back land on /sign-in with ?error= (ee/sso/messages.ts).
 * Returns the message to show when it can't start; null once the browser
 * is on its way.
 */
export async function startSsoSignIn(
  email: string,
  callbackURL: string,
  t: SignInErrorTranslator,
): Promise<string | null> {
  try {
    const { data, error } = await authClient.signIn.sso({
      email: email.trim(),
      callbackURL,
      errorCallbackURL: signInPath(callbackURL),
    });
    if (error) {
      // The server's message is English; the code and the address's domain
      // (the one the server looked up) give the reader's language.
      return error.status === 429
        ? t("sso.rateLimited")
        : ssoSignInErrorMessage(error.code, t, emailDomain(email));
    }
    if (!data?.url) return ssoSignInErrorMessage(null, t);
    window.location.href = data.url;
    return null;
  } catch {
    return ssoSignInErrorMessage(null, t);
  }
}
