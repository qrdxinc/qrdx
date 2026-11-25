import "server-only";

import { database as db, portalClient, user } from "@repo/database";
import { baseUrl } from "@repo/email/origin";
import { isReservedEmailAddress } from "@repo/email/reserved-address";
import { WelcomeEmail, welcomeSubject } from "@repo/email/templates/welcome";
import { DEFAULT_LOCALE, isLocale } from "@repo/i18n/config";
import { localizePath } from "@repo/i18n/paths";
import { eq } from "drizzle-orm";
import { env } from "@/env";
import { teamNotesUnsubscribeUrl } from "@/lib/events/unsubscribe";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { emailIntl } from "@/lib/i18n/email";
import { PLAN_LIMITS } from "@/lib/plans";
import { currencyForCountry, formatPrice, PRICING } from "@/lib/pricing";
import { workspaceLink } from "@/lib/workspace-paths";
import { greetingName } from "./greeting";
import { freeInvite } from "./invite-line";
import { personalSender } from "./personal-sender";
import { sendEmail } from "./send";
import { wantsTeamNotes } from "./team-notes";

// The welcome email: one short note, sent once right after someone makes an
// account (lib/analytics/sign-up-hook.ts runs it after the response), from
// EMAIL_FROM_PERSONAL with replies to it; without that sender it isn't sent
// (it promises a person reads every reply). Agency portal clients don't get
// it. It's one of the notes from the QRdx team (./team-notes.ts), so
// it only goes out where those exist (the teamNotes feature: qrdx.dev with
// email set up) and its footer turns them off. Accounts are only made
// through sign-up (/api/auth), never by the console or an import; test
// accounts use reserved addresses, which never get email, and local
// development and previews send nothing (lib/delivery-guard.ts). The
// idempotency key welcome:<userId> keeps a retried request from sending it
// twice. One note follows on a schedule, only to accounts that haven't made
// a dynamic code two days later (./activation-nudge.tsx). Under the Pro
// line it offers the invite (./invite-line.ts).

export type WelcomeOutcome =
  | "sent"
  | "off"
  | "no_personal_sender"
  | "portal_client"
  | "not_found"
  | "opted_out"
  | "banned"
  | "reserved_address"
  | "failed";

let warnedNoSender = false;

/**
 * An agency's client (ee/client-portal): their first portal sign-in makes a
 * free QRdx account, but the portal never shows it, so no QRdx welcome. The
 * portal_client row is made when they're invited, before that sign-in.
 */
export async function isPortalClient(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: portalClient.id })
    .from(portalClient)
    .where(eq(portalClient.email, email.trim().toLowerCase()))
    .limit(1);
  return Boolean(row);
}

export async function sendWelcomeEmail({
  userId,
  country,
}: {
  userId: string;
  /** Where the sign-up came from (x-vercel-ip-country): Pro's currency */
  country: string | null;
}): Promise<WelcomeOutcome> {
  if (!(isFeatureAvailable("teamNotes") && env.EMAIL_FROM)) return "off";
  // It promises that a person reads every reply: only from one.
  const sender = personalSender();
  if (!sender) {
    if (!warnedNoSender) {
      warnedNoSender = true;
      console.warn(
        JSON.stringify({
          event: "email.welcome",
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
  if (await isPortalClient(row.email)) return "portal_client";

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
        firstName={greetingName(row.name, row.email).name}
        freeDynamicCodes={PLAN_LIMITS.free.dynamicCodes}
        intl={intl}
        invite={await freeInvite(row.id)}
        newCodeUrl={absolute(localizePath("/playground", intl.locale))}
        proCustomDomains={PLAN_LIMITS.pro.customDomains}
        proMonthly={price("month")}
        proYearly={price("year")}
        recipient={row.email}
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
