import "server-only";

import { database as db, user } from "@repo/database";
import { baseUrl } from "@repo/email/origin";
import { isReservedEmailAddress } from "@repo/email/reserved-address";
import { WelcomeEmail, welcomeSubject } from "@repo/email/templates/welcome";
import { DEFAULT_LOCALE, isLocale } from "@repo/i18n/config";
import { eq } from "drizzle-orm";
import { env } from "@/env";
import { teamNotesUnsubscribeUrl } from "@/lib/events/unsubscribe";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { emailIntl } from "@/lib/i18n/email";
import { PLAN_LIMITS } from "@/lib/plans";
import { currencyForCountry, formatPrice, PRICING } from "@/lib/pricing";
import { workspaceLink } from "@/lib/workspace-paths";
import { firstName } from "./personal-notes";
import { parseSender, personalSender } from "./personal-sender";
import { sendEmail } from "./send";
import { wantsTeamNotes } from "./team-notes";

// The welcome email: one short note, sent once right after someone makes an
// account (lib/analytics/sign-up-hook.ts runs it after the response), from
// EMAIL_FROM_PERSONAL when it's set, else EMAIL_FROM, with replies to that
// address. It's one of the notes from the QRdx team (./team-notes.ts), so
// it only goes out where those exist (the teamNotes feature: qrdx.dev with
// email set up) and its footer turns them off. Accounts are only made
// through sign-up (/api/auth), never by the console or an import; test
// accounts use reserved addresses, which never get email, and local
// development and previews send nothing (lib/delivery-guard.ts). The
// idempotency key welcome:<userId> keeps a retried request from sending it
// twice. No other emails follow it on a schedule.

export type WelcomeOutcome =
  | "sent"
  | "off"
  | "not_found"
  | "opted_out"
  | "banned"
  | "reserved_address"
  | "failed";

export async function sendWelcomeEmail({
  userId,
  country,
}: {
  userId: string;
  /** Where the sign-up came from (x-vercel-ip-country): Pro's currency */
  country: string | null;
}): Promise<WelcomeOutcome> {
  if (!(isFeatureAvailable("teamNotes") && env.EMAIL_FROM)) return "off";
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      banned: user.banned,
      locale: user.locale,
      teamNotes: user.teamNotes,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row) return "not_found";
  if (row.banned) return "banned";
  if (isReservedEmailAddress(row.email)) return "reserved_address";
  if (!wantsTeamNotes(row)) return "opted_out";

  const sender = personalSender() ?? parseSender(env.EMAIL_FROM);
  const intl = await emailIntl(
    isLocale(row.locale) ? row.locale : DEFAULT_LOCALE,
  );
  const currency = currencyForCountry(country);
  const price = (interval: "month" | "year") =>
    formatPrice(PRICING.pro[interval].amounts[currency], currency, intl.locale);
  const absolute = (path: string) => new URL(path, baseUrl).toString();
  const unsubscribeUrl = teamNotesUnsubscribeUrl(row.id);

  const result = await sendEmail({
    to: row.email,
    from: sender.from,
    replyTo: sender.address,
    subject: welcomeSubject(intl),
    react: (
      <WelcomeEmail
        firstName={firstName(row.name)}
        freeDynamicCodes={PLAN_LIMITS.free.dynamicCodes}
        intl={intl}
        newCodeUrl={absolute("/playground")}
        proCustomDomains={PLAN_LIMITS.pro.customDomains}
        proMonthly={price("month")}
        proYearly={price("year")}
        scansUrl={absolute(workspaceLink(null, "/analytics"))}
        senderName={sender.name}
        unsubscribeUrl={unsubscribeUrl}
      />
    ),
    unsubscribeUrl,
    idempotencyKey: `welcome:${row.id}`,
    tags: [{ name: "kind", value: "welcome" }],
  });
  return result.sent ? "sent" : "failed";
}
