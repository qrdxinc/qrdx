import "server-only";

import type { SignInCodeLimit, SignInCodeSender } from "@repo/auth/email-otp";
import {
  SignInCodeEmail,
  signInCodeSubject,
} from "@repo/email/templates/sign-in-code";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { sendEmail } from "@/lib/email/send";
import { emailIntlForAddress } from "@/lib/i18n/email-locale";
import { currentRequestDetails } from "@/lib/security/request-details";
import {
  addressKey,
  addressMayRequestCode,
  deliverSignInCode,
} from "./sign-in-code-delivery";

// Per address, shared across server instances (Upstash). Better Auth's own
// per-IP limit is in memory per instance, so these are what stop one inbox
// being flooded with codes and bound guessing over a day (3 tries per code).
// Fail open when Upstash isn't configured. Checked by signInCodeAllowed
// below, before a code is made.
const perAddressLimiter = createRateLimiter({
  prefix: "qrdx:sign-in-code",
  limiter: slidingWindow(5, "15 m"),
});
const perAddressDailyLimiter = createRateLimiter({
  prefix: "qrdx:sign-in-code-day",
  limiter: slidingWindow(30, "1 d"),
});

/**
 * Whether `email` may be sent another sign-in code: 5 in 15 minutes, 30 a
 * day, by its hashed address. Registered with @repo/auth next to the
 * sender, which checks it before the code is made (signInCodeGate), so a
 * refused resend leaves the last code working. One call counts one request.
 */
export const signInCodeAllowed: SignInCodeLimit = (email) =>
  addressMayRequestCode(addressKey(email), [
    perAddressLimiter,
    perAddressDailyLimiter,
  ]);

/**
 * Registered with @repo/auth in app/api/auth/[...all]/route.ts. The email
 * says roughly where the code was asked for, from the request's geo headers.
 * The per-address limit has run by now (signInCodeAllowed).
 */
export const sendSignInCode: SignInCodeSender = async ({ email, otp }) => {
  // The account's language, or the site's when there's no account yet.
  const intl = await emailIntlForAddress(email);
  const { location } = await currentRequestDetails(new Date(), intl);
  await deliverSignInCode(
    { email, otp },
    {
      nodeEnv: process.env.NODE_ENV,
      deliveryAllowed: isOutboundDeliveryAllowed(),
      log: (line) => console.info(line),
      send: () =>
        sendEmail({
          to: email,
          subject: signInCodeSubject(intl),
          react: <SignInCodeEmail code={otp} intl={intl} location={location} />,
          tags: [{ name: "category", value: "sign_in_code" }],
        }),
    },
  );
};
