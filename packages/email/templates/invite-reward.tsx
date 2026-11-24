import type { EmailIntl } from "../intl";
import { EmailButton, EmailHeading, EmailLayout, EmailText } from "./layout";
import { MutedText } from "./parts";

export interface InviteRewardEmailProps {
  /** Dynamic codes each side got (apps/app/lib/invites/terms.ts) */
  bonusCodes: number;
  /** Friends the reader has now been rewarded for, this one included */
  rewardedFriends: number;
  /** The most friends one person can be rewarded for */
  maxFriends: number;
  /** Settings → Invite friends (absolute) */
  inviteUrl: string;
  /** Turns notes from the team off in one click */
  unsubscribeUrl: string;
  /** The address it's sent to (the footer names it) */
  recipient?: string;
  /** The recipient's language */
  intl: EmailIntl;
}

/** The subject line in the recipient's language. */
export const inviteRewardSubject = (
  intl: EmailIntl,
  { bonusCodes }: { bonusCodes: number }
) => intl.t("inviteReward.subject", { count: bonusCodes });

/**
 * Sent to the inviter when a friend who signed up through their invite link
 * makes their first dynamic code and both of them get more dynamic codes
 * (apps/app/lib/invites). Never names the friend: an invite link can be
 * shared publicly. One of the notes from the QRdx team, so its footer can
 * turn them off.
 */
export function InviteRewardEmail({
  bonusCodes,
  rewardedFriends,
  maxFriends,
  inviteUrl,
  unsubscribeUrl,
  recipient,
  intl,
}: InviteRewardEmailProps) {
  const { t } = intl;
  const last = rewardedFriends >= maxFriends;
  return (
    <EmailLayout
      intl={intl}
      preview={t("inviteReward.preview", { count: bonusCodes })}
      recipient={recipient}
      reason={t("inviteReward.reason")}
      unsubscribeUrl={unsubscribeUrl}
    >
      <EmailHeading>
        {t("inviteReward.heading", { count: bonusCodes })}
      </EmailHeading>
      <EmailText>{t("inviteReward.body", { count: bonusCodes })}</EmailText>
      <EmailText>
        {last
          ? t("inviteReward.last", { max: maxFriends, count: bonusCodes })
          : t("inviteReward.progress", {
              rewarded: rewardedFriends,
              max: maxFriends,
            })}
      </EmailText>
      <EmailButton href={inviteUrl}>
        {last ? t("inviteReward.seeInvites") : t("inviteReward.inviteMore")}
      </EmailButton>
      <MutedText>{t("inviteReward.keeps")}</MutedText>
    </EmailLayout>
  );
}

/** What the preview app (apps/email) renders. */
InviteRewardEmail.PreviewProps = {
  bonusCodes: 5,
  rewardedFriends: 3,
  maxFriends: 10,
  inviteUrl: "https://qrdx.dev/settings/invite",
  unsubscribeUrl: "https://qrdx.dev/unsubscribe?token=preview",
  recipient: "alex@example.com",
} satisfies Omit<InviteRewardEmailProps, "intl">;
