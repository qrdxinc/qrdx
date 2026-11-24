import "server-only";

import { graceEndsAt } from "@repo/auth/subscription-access";
import { database as db, user } from "@repo/database";
import { baseUrl } from "@repo/email/origin";
import { isReservedEmailAddress } from "@repo/email/reserved-address";
import {
  PaymentFailedEmail,
  paymentFailedSubject,
} from "@repo/email/templates/payment-failed";
import { DEFAULT_LOCALE, isLocale } from "@repo/i18n/config";
import { eq } from "drizzle-orm";
import { env } from "@/env";
import { teamNotesUnsubscribeUrl } from "@/lib/events/unsubscribe";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { emailIntl } from "@/lib/i18n/email";
import { planForSubscriptionProduct } from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import { greetingName } from "./greeting";
import { personalSender } from "./personal-sender";
import { sendEmail } from "./send";
import { wantsTeamNotes } from "./team-notes";

// One plain email when a subscription's payment fails (owner decision, 25
// Nov 2026): the Polar webhook (app/api/webhook/polar) calls it when a
// subscription changes to past_due, after the response. Codes keep
// working; the plan's features stay on for 7 days from the change
// (packages/auth/subscription-access.ts); one button opens the billing
// portal to update the card. The app shell shows the same thing in a
// banner while the subscription is past_due (components/billing).
//
// It goes like the welcome email: a note from the QRdx team
// (./team-notes.ts), only where those exist, from EMAIL_FROM_PERSONAL with
// replies to it, never to someone who turned them off, a banned account or
// a reserved test address. Polar may email the customer about the failed
// payment too (its own dunning). The webhook sends it only on the change to
// past_due, which it reads from the stored row, and the idempotency key
// payment-failed:<subscriptionId>:<past_due_since> covers redeliveries.

export type PaymentFailedOutcome =
  | "sent"
  | "off"
  | "no_personal_sender"
  | "not_found"
  | "banned"
  | "reserved_address"
  | "opted_out"
  | "failed";

let warnedNoSender = false;

/** Sends the failed-payment email. Never throws: what happened is the answer. */
export async function sendPaymentFailedEmail({
  subscriptionId,
  userId,
  productId,
  pastDueSince,
}: {
  subscriptionId: string;
  userId: string;
  productId: string;
  /** When it changed to past_due (subscription.past_due_since) */
  pastDueSince: Date;
}): Promise<PaymentFailedOutcome> {
  try {
    if (!(isFeatureAvailable("teamNotes") && env.EMAIL_FROM)) return "off";
    const sender = personalSender();
    if (!sender) {
      if (!warnedNoSender) {
        warnedNoSender = true;
        console.warn(
          JSON.stringify({
            event: "email.payment_failed",
            outcome: "no_personal_sender",
          }),
        );
      }
      return "no_personal_sender";
    }
    const [row] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        banned: user.banned,
        banExpires: user.banExpires,
        locale: user.locale,
        teamNotes: user.teamNotes,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!row) return "not_found";
    if (row.banned && (!row.banExpires || row.banExpires > new Date())) {
      return "banned";
    }
    if (isReservedEmailAddress(row.email)) return "reserved_address";
    if (!wantsTeamNotes(row)) return "opted_out";

    const intl = await emailIntl(
      isLocale(row.locale) ? row.locale : DEFAULT_LOCALE,
    );
    const unsubscribeUrl = teamNotesUnsubscribeUrl(row.id);
    const result = await sendEmail({
      to: row.email,
      from: sender.from,
      replyTo: sender.address,
      subject: paymentFailedSubject(intl),
      react: (
        <PaymentFailedEmail
          billingUrl={new URL("/settings/portal", baseUrl).toString()}
          firstName={greetingName(row.name, row.email).name}
          graceEndsAt={graceEndsAt(pastDueSince)}
          intl={intl}
          planName={PLAN_NAMES[planForSubscriptionProduct(productId)]}
          recipient={row.email}
          senderName={sender.name}
          unsubscribeUrl={unsubscribeUrl}
        />
      ),
      unsubscribeUrl,
      idempotencyKey: `payment-failed:${subscriptionId}:${pastDueSince.getTime()}`,
      tags: [{ name: "kind", value: "payment-failed" }],
    });
    if (result.sent) return "sent";
    console.error(
      JSON.stringify({
        event: "email.payment_failed_failed",
        subscriptionId,
        error: result.code ?? result.reason,
      }),
    );
    return "failed";
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "email.payment_failed_failed",
        subscriptionId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return "failed";
  }
}
