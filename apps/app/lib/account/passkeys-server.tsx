import "server-only";

import {
  type PasskeyChange,
  PasskeyNoticeEmail,
  passkeyNoticeSubject,
} from "@repo/email/templates/passkey-notice";
import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { sendEmail } from "@/lib/email/send";
import { emailIntlForAddress } from "@/lib/i18n/email-locale";
import { currentRequestDetails } from "@/lib/security/request-details";
import { deliverPasskeyNotice } from "./passkeys";

/**
 * Tells the account's address that a passkey was added or removed, with the
 * device, place and time of the request (read here). Runs after the change
 * (best effort, never throws); a notice that couldn't be sent is logged as a
 * warning. No addresses or ids in the log.
 */
export async function sendPasskeyNotice({
  email,
  change,
  passkeyName,
}: {
  email: string;
  change: PasskeyChange;
  passkeyName: string;
}): Promise<void> {
  // The account's language, never the request's: it may not be the owner's.
  const intl = await emailIntlForAddress(email, { fromRequest: false });
  const subject = passkeyNoticeSubject(change, intl);
  const details = await currentRequestDetails(new Date(), intl);
  const notice = await deliverPasskeyNotice(
    { email, subject },
    {
      nodeEnv: process.env.NODE_ENV,
      deliveryAllowed: isOutboundDeliveryAllowed(),
      log: (line) => console.info(line),
      send: () =>
        sendEmail({
          to: email,
          subject,
          react: (
            <PasskeyNoticeEmail
              change={change}
              details={details}
              intl={intl}
              passkeyName={passkeyName}
            />
          ),
          tags: [{ name: "category", value: `passkey_${change}` }],
        }),
    },
  );
  const level = notice === "not-sent" ? "warn" : "info";
  console[level](
    JSON.stringify({ event: `account.passkey_${change}`, notice }),
  );
}
