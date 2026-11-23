import "server-only";

import { database as db, user } from "@repo/database";
import { baseUrl } from "@repo/email/origin";
import { isReservedEmailAddress } from "@repo/email/reserved-address";
import {
  InviteRewardEmail,
  inviteRewardSubject,
} from "@repo/email/templates/invite-reward";
import { DEFAULT_LOCALE, isLocale } from "@repo/i18n/config";
import { eq } from "drizzle-orm";
import { personalSender } from "@/lib/email/personal-sender";
import { sendEmail } from "@/lib/email/send";
import { wantsTeamNotes } from "@/lib/email/team-notes";
import { isPortalClient } from "@/lib/email/welcome";
import { teamNotesUnsubscribeUrl } from "@/lib/events/unsubscribe";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { emailIntl } from "@/lib/i18n/email";
import { INVITE_BONUS_CODES, INVITE_MAX_REWARDED_FRIENDS } from "./terms";

// The one email the invite reward sends: to the inviter, when a friend's
// first dynamic code earns them both more codes (./qualify.ts). It never
// names the friend. One of the notes from the QRdx team (like the first-scan
// email, lib/email/first-scan.tsx): on by default, off with the one-click
// link in it or Settings > Notifications; only where those notes go out
// (qrdx.dev with email and its personal sender), in the inviter's saved
// language, else English.

export type InviteRewardEmailOutcome =
  | "sent"
  | "off"
  | "no_personal_sender"
  | "not_found"
  | "banned"
  | "reserved_address"
  | "opted_out"
  | "portal_client"
  | "failed";

/** Emails the inviter about the reward. Never throws: what happened is the answer. */
export async function sendInviteRewardEmail({
  inviterUserId,
  rewardedFriends,
}: {
  inviterUserId: string;
  /** Friends they've now been rewarded for (the slot this reward took) */
  rewardedFriends: number;
}): Promise<InviteRewardEmailOutcome> {
  try {
    if (!isFeatureAvailable("teamNotes")) return "off";
    const sender = personalSender();
    if (!sender) return "no_personal_sender";
    const [inviter] = await db
      .select({
        id: user.id,
        email: user.email,
        banned: user.banned,
        banExpires: user.banExpires,
        locale: user.locale,
        teamNotes: user.teamNotes,
      })
      .from(user)
      .where(eq(user.id, inviterUserId))
      .limit(1);
    if (!inviter) return "not_found";
    // A ban in force (lib/oauth.ts isBanActive): one that ended doesn't count.
    if (
      inviter.banned &&
      (!inviter.banExpires || inviter.banExpires > new Date())
    ) {
      return "banned";
    }
    if (isReservedEmailAddress(inviter.email)) return "reserved_address";
    if (!wantsTeamNotes(inviter)) return "opted_out";
    // An agency's client: their QRdx account is the portal's, not theirs.
    if (await isPortalClient(inviter.email)) return "portal_client";

    const intl = await emailIntl(
      isLocale(inviter.locale) ? inviter.locale : DEFAULT_LOCALE,
    );
    const unsubscribeUrl = teamNotesUnsubscribeUrl(inviter.id);
    const result = await sendEmail({
      to: inviter.email,
      from: sender.from,
      replyTo: sender.address,
      subject: inviteRewardSubject(intl, { bonusCodes: INVITE_BONUS_CODES }),
      react: (
        <InviteRewardEmail
          bonusCodes={INVITE_BONUS_CODES}
          intl={intl}
          inviteUrl={new URL("/settings/invite", baseUrl).toString()}
          maxFriends={INVITE_MAX_REWARDED_FRIENDS}
          rewardedFriends={rewardedFriends}
          unsubscribeUrl={unsubscribeUrl}
        />
      ),
      unsubscribeUrl,
      // One email per reward: the slot is the inviter's own, numbered.
      idempotencyKey: `invite-reward:${inviter.id}:${rewardedFriends}`,
      tags: [{ name: "kind", value: "invite-reward" }],
    });
    if (result.sent) return "sent";
    console.error(
      JSON.stringify({
        event: "email.invite_reward_failed",
        error: result.code ?? result.reason,
      }),
    );
    return "failed";
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "email.invite_reward_failed",
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return "failed";
  }
}
