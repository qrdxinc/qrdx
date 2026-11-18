import "server-only";

import type { NewSignIn, NewSignInNotifier } from "@repo/auth/new-sign-in";
import { after } from "next/server";
import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { sendEmail } from "@/lib/email/send";
import {
  NewSignInEmail,
  newSignInSubject,
} from "@/lib/email/templates/new-sign-in";
import { emailIntlForUser } from "@/lib/i18n/email-locale";
import { requestDetails } from "@/lib/security/request-details";
import {
  deliverNewSignInNotice,
  signInMethodLabel,
} from "./new-sign-in-notice";

async function sendNewSignInAlert({
  user,
  method,
  secondStep,
  headers,
}: NewSignIn): Promise<void> {
  // The account's language: the request is the one being reported, and may
  // not be the owner's.
  const intl = await emailIntlForUser(user.id);
  const details = requestDetails(headers, new Date(), intl.locale);
  const methodLabel = signInMethodLabel(method, secondStep, intl);
  const summary = [
    details.device,
    details.location,
    details.ip,
    details.time,
    methodLabel,
  ]
    .filter(Boolean)
    .join(", ");
  const outcome = await deliverNewSignInNotice(
    { email: user.email, summary },
    {
      nodeEnv: process.env.NODE_ENV,
      deliveryAllowed: isOutboundDeliveryAllowed(),
      log: (line) => console.info(line),
      send: () =>
        sendEmail({
          to: user.email,
          subject: newSignInSubject(intl),
          react: (
            <NewSignInEmail
              details={details}
              intl={intl}
              method={methodLabel}
            />
          ),
          tags: [{ name: "category", value: "new_sign_in" }],
        }),
    },
  );
  // No addresses or ids in the log. "skipped": a reserved test address.
  const level = outcome === "not-sent" ? "error" : "info";
  console[level](
    JSON.stringify({ event: "account.new_sign_in_alert", outcome }),
  );
}

/**
 * Registered with @repo/auth in app/api/auth/[...all]/route.ts. Sends after
 * the response, so the alert never slows a sign-in down; outside a request
 * (no `after`), it sends straight away.
 */
export const notifyNewSignIn: NewSignInNotifier = (signIn) => {
  try {
    after(() => sendNewSignInAlert(signIn));
  } catch {
    return sendNewSignInAlert(signIn);
  }
};
