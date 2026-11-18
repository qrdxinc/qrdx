import "server-only";

import { database as db, organization, user } from "@repo/database";
import {
  TeamInviteEmail,
  teamInviteSubject,
} from "@repo/email/templates/team-invite";
import type { Locale } from "@repo/i18n/config";
import { eq } from "drizzle-orm";
import { invitePath } from "@/app/(app)/dashboard/team/_lib/team";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import { emailIntlForInvitee } from "@/lib/i18n/email-locale";
import { baseUrl } from "@/lib/metadata";

/**
 * Emails a team invitation (transactional, no unsubscribe). Returns false when
 * email isn't configured or sending failed: the dashboard's copyable invite
 * link stays the fallback either way. Never throws.
 *
 * In the invitee's saved language when the address has an account, else in
 * `inviterLocale` (the inviter's, from their own request), else English.
 * Admin resends pass none: admin is English only.
 */
export async function sendTeamInviteEmail(
  invitation: {
    id: string;
    email: string;
    role: string;
    expiresAt: Date;
    organizationId: string;
    inviterId: string;
  },
  { inviterLocale = null }: { inviterLocale?: Locale | null } = {},
): Promise<boolean> {
  if (!isEmailConfigured) return false;
  try {
    const [[team], [inviter]] = await db.batch([
      db
        .select({ name: organization.name })
        .from(organization)
        .where(eq(organization.id, invitation.organizationId))
        .limit(1),
      db
        .select({ name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, invitation.inviterId))
        .limit(1),
    ]);
    if (!team) return false;
    const intl = await emailIntlForInvitee(invitation.email, inviterLocale);
    const inviterName = inviter?.name || intl.t("teamInvite.someone");
    const inviteUrl = new URL(
      invitePath(invitation.id),
      baseUrl.origin,
    ).toString();
    const result = await sendEmail({
      to: invitation.email,
      subject: teamInviteSubject(
        { inviterName, teamName: team.name, memberRole: invitation.role },
        intl,
      ),
      react: (
        <TeamInviteEmail
          expiresAt={invitation.expiresAt}
          intl={intl}
          inviteUrl={inviteUrl}
          inviterName={inviterName}
          memberRole={invitation.role}
          teamName={team.name}
        />
      ),
      replyTo: inviter?.email,
      // Re-inviting extends the expiry, which sends a fresh email.
      idempotencyKey: `invite:${invitation.id}:${new Date(invitation.expiresAt).getTime()}`,
      tags: [{ name: "category", value: "team_invite" }],
    });
    return result.sent;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "email.invite_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return false;
  }
}
