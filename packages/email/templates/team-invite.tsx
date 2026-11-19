import type { EmailIntl } from "../intl";
import {
  EmailButton,
  EmailDivider,
  EmailHeading,
  EmailLayout,
  EmailText,
} from "./layout";
import { formatEmailDateTime, MutedText } from "./parts";

export interface TeamInviteEmailProps {
  teamName: string;
  inviterName: string;
  memberRole: string;
  inviteUrl: string;
  expiresAt: Date | string;
  /** The invitee's language (apps/app/lib/events/emails.tsx picks it) */
  intl: EmailIntl;
}

// The workspace roles (apps/app/lib/permissions.ts), strongest first. What
// the invitation says about each is emails.teamInvite in apps/app/messages/en.json.
const RANK = ["owner", "admin", "member", "billing", "viewer"] as const;

export type InviteRole = (typeof RANK)[number];

/**
 * The strongest role in Better Auth's comma-separated field, each part
 * matched exactly; anything unknown reads as viewer, the same rule as the
 * app's permissions.
 */
export function inviteRole(role: string | null | undefined): InviteRole {
  const roles = (role ?? "").split(",");
  return RANK.find((known) => roles.includes(known)) ?? "viewer";
}

/** The subject line, also the inbox preview: who, where and as what. */
export function teamInviteSubject(
  {
    inviterName,
    teamName,
    memberRole,
  }: Pick<TeamInviteEmailProps, "inviterName" | "teamName" | "memberRole">,
  intl: EmailIntl
) {
  return intl.t("teamInvite.subject", {
    inviter: inviterName,
    team: teamName,
    role: inviteRole(memberRole),
  });
}

/** Transactional: sent when an owner or admin invites someone to a workspace. */
export function TeamInviteEmail({
  teamName,
  inviterName,
  memberRole,
  inviteUrl,
  expiresAt,
  intl,
}: TeamInviteEmailProps) {
  const { t } = intl;
  const role = inviteRole(memberRole);
  return (
    <EmailLayout
      intl={intl}
      preview={teamInviteSubject({ inviterName, teamName, memberRole }, intl)}
      reason={t("teamInvite.reason")}
    >
      <EmailHeading>{t("teamInvite.heading", { team: teamName })}</EmailHeading>
      <EmailText>
        {t("teamInvite.body", { inviter: inviterName, team: teamName, role })}{" "}
        {t(`teamInvite.roles.${role}`)}
      </EmailText>
      <EmailButton href={inviteUrl}>{t("teamInvite.accept")}</EmailButton>
      <EmailDivider />
      <MutedText>
        {t("teamInvite.expires", {
          date: formatEmailDateTime(expiresAt, intl.locale),
        })}
      </MutedText>
      <MutedText>{t("teamInvite.pasteLink", { url: inviteUrl })}</MutedText>
    </EmailLayout>
  );
}

/** What the preview app (apps/email) renders. */
TeamInviteEmail.PreviewProps = {
  teamName: "Acme",
  inviterName: "Sam Lee",
  memberRole: "member",
  inviteUrl: "https://qrdx.dev/invite/preview",
  expiresAt: new Date("2026-11-26T09:30:00Z"),
} satisfies Omit<TeamInviteEmailProps, "intl">;
