import "server-only";

import type { AcquisitionProps } from "@repo/analytics/events";
import type { NewUserSignUp } from "@repo/auth/referral";
import { LANDING_HEADER } from "@repo/auth/referral-keys";
import { database as db, userAcquisition } from "@repo/database";
import { eq } from "drizzle-orm";
import { isMissingTableError } from "@/lib/affiliates/missing-table";
import { logError } from "@/lib/log-error";
import { baseUrl } from "@/lib/metadata";
import { acquisitionChannel } from "./channel";
import {
  cleanLanding,
  decodeLandingHeader,
  type SignUpLanding,
} from "./landing";

// How a new account found QRdx (user_acquisition), written once at sign-up
// from what the sign-up request carried (lib/analytics/landing.ts): the
// header an email-code sign-up sends, or the OAuth state of a Google or
// GitHub one. Every field is cleaned again here and the channel is worked
// out here (./channel.ts); nothing the browser says is taken as it is.
//
// Best effort, like the affiliate referral it runs after
// (lib/analytics/sign-up-hook.ts): it never throws and never holds up the
// sign-up. Where the table doesn't exist yet, that's noted once and nothing
// is written.

/** What a new account's sign-up carried about its visit, cleaned; null when nothing. */
export function signUpLandingOf(
  signUp: Pick<NewUserSignUp, "headers" | "oauthLanding">,
): SignUpLanding | null {
  const ownHost = baseUrl.hostname;
  return (
    decodeLandingHeader(signUp.headers?.get(LANDING_HEADER), ownHost) ??
    cleanLanding(signUp.oauthLanding, ownHost)
  );
}

export type AcquisitionResult =
  | "recorded"
  | "already_recorded"
  | "nothing_carried"
  | "missing_table"
  | "error";

let warnedMissing = false;

/**
 * Records how the account found QRdx. Without a carried landing (a browser
 * sending Do Not Track, a sign-up from an older page) only an affiliate's
 * credit is worth a row; otherwise the account stays "unknown". Never throws.
 */
export async function recordAcquisition(input: {
  userId: string;
  landing: SignUpLanding | null;
  /** An affiliate was credited with this account */
  affiliate: boolean;
  now?: Date;
}): Promise<AcquisitionResult> {
  const { landing, affiliate } = input;
  if (!(landing || affiliate)) return "nothing_carried";
  const channel = acquisitionChannel(landing, { affiliate });
  try {
    const inserted = await db
      .insert(userAcquisition)
      .values({
        userId: input.userId,
        channel,
        referrerHost: landing?.referrer_host ?? null,
        utmSource: landing?.utm_source ?? null,
        utmMedium: landing?.utm_medium ?? null,
        utmCampaign: landing?.utm_campaign ?? null,
        refTag: landing?.ref ?? null,
        landingPath: landing?.landing_path ?? null,
        signupPath: landing?.signup_path ?? null,
        createdAt: input.now ?? new Date(),
      })
      .onConflictDoNothing({ target: userAcquisition.userId })
      .returning({ userId: userAcquisition.userId });
    if (inserted.length === 0) return "already_recorded";
    // The channel only: no id, host or path.
    console.info(
      JSON.stringify({ event: "analytics.acquisition_recorded", channel }),
    );
    return "recorded";
  } catch (error) {
    if (isMissingTableError(error)) {
      if (!warnedMissing) {
        warnedMissing = true;
        console.warn(
          "Growth analytics: user_acquisition doesn't exist yet (update the database schema: the migrate service with Docker, bun run db:push otherwise). Sign-up channels aren't recorded until it does.",
        );
      }
      return "missing_table";
    }
    logError(error as Error, { action: "analytics.record_acquisition" });
    return "error";
  }
}

// ── On events ────────────────────────────────────────────────────────────────

/**
 * Campaign names (utm_campaign) on links QRdx shares itself, passed on to
 * events as they are: `utm_campaign=switch` marks every link the switch
 * campaign puts out (emails, community answers, partners, directories),
 * with where it was shared in utm_source and utm_medium. Any other tag could
 * name a company or a person, so it stays in user_acquisition.
 */
export const OWN_CAMPAIGNS = ["switch"] as const;
export type OwnCampaign = (typeof OWN_CAMPAIGNS)[number];

/** A stored campaign tag when it's one of QRdx's own, else null. */
export function ownCampaign(
  tag: string | null | undefined,
): OwnCampaign | null {
  const value = tag?.trim().toLowerCase() ?? "";
  return (OWN_CAMPAIGNS as readonly string[]).includes(value)
    ? (value as OwnCampaign)
    : null;
}

/**
 * How an account found QRdx, for a server event's properties: its channel
 * ("unknown" when nothing was recorded) and QRdx's own campaign, if any.
 * Empty when it can't be read (the table missing, a database error). Never
 * throws.
 */
export async function acquisitionProps(
  userId: string,
): Promise<AcquisitionProps> {
  try {
    const [row] = await db
      .select({
        channel: userAcquisition.channel,
        utmCampaign: userAcquisition.utmCampaign,
      })
      .from(userAcquisition)
      .where(eq(userAcquisition.userId, userId))
      .limit(1);
    if (!row) return { channel: "unknown" };
    const campaign = ownCampaign(row.utmCampaign);
    return { channel: row.channel, ...(campaign && { campaign }) };
  } catch (error) {
    if (!isMissingTableError(error)) {
      logError(error as Error, { action: "analytics.acquisition_props" });
    }
    return {};
  }
}
