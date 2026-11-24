import { auth } from "@repo/auth/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  SettingsRow,
  SettingsSection,
} from "@/app/(app)/settings/account/_components/settings-section";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import {
  type InviteDashboard,
  loadInviteDashboard,
} from "@/lib/invites/dashboard";
import { inviteLink } from "@/lib/invites/links";
import { InvitesNotReadyError } from "@/lib/invites/missing-table";
import {
  INVITE_BONUS_CODES,
  INVITE_MAX_INVITER_CODES,
  INVITE_MAX_REWARDED_FRIENDS,
  INVITE_QUALIFY_DAYS,
} from "@/lib/invites/terms";
import { signInPath } from "@/lib/safe-redirect";
import { SettingsHeader } from "../components/settings-header";
import { InviteLinkField } from "./_components/invite-link-field";

export const metadata: Metadata = {
  title: "Invite friends",
  robots: { index: false, follow: false },
};

const PAGE = "/settings/invite";

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1 rounded-xl border px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/**
 * Settings → Invite friends: the person's invite link, how many friends
 * joined and were rewarded, the codes it earned, and the rules in plain
 * words (lib/invites). Counts only: it never says who signed up.
 */
export default async function InviteFriendsPage() {
  if (!isFeatureAvailable("inviteRewards")) notFound();
  const t = await getAppTranslations("app.settings.inviteFriends.page");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(signInPath(PAGE));

  let dashboard: InviteDashboard | null = null;
  try {
    dashboard = await loadInviteDashboard(session.user.id);
  } catch (error) {
    if (!(error instanceof InvitesNotReadyError)) throw error;
  }

  return (
    <div className="space-y-6">
      <SettingsHeader
        description={t("description", { count: INVITE_BONUS_CODES })}
        title={t("title")}
      />
      {dashboard ? (
        <LinkSection dashboard={dashboard} />
      ) : (
        <p className="bg-muted/40 rounded-lg border p-4 text-sm">
          {t("notReady")}
        </p>
      )}
      <Rules />
    </div>
  );
}

async function LinkSection({ dashboard }: { dashboard: InviteDashboard }) {
  const t = await getAppTranslations("app.settings.inviteFriends.page");
  const atCap = dashboard.rewardedFriends >= INVITE_MAX_REWARDED_FRIENDS;
  return (
    <SettingsSection
      description={t("shareYourLink", { count: INVITE_BONUS_CODES })}
      id="link"
      title={t("yourInviteLink")}
    >
      <SettingsRow description={t("sameVisit")} label={t("link")}>
        <InviteLinkField link={inviteLink(dashboard.code)} />
      </SettingsRow>
      <div className="grid grid-cols-1 gap-3 px-5 py-5 sm:grid-cols-3 sm:px-6">
        <Stat
          label={t("friendsJoined")}
          value={dashboard.joined.toLocaleString("en-US")}
        />
        <Stat
          label={t("friendsRewarded")}
          value={t("rewardedOfMax", {
            rewarded: dashboard.rewardedFriends,
            max: INVITE_MAX_REWARDED_FRIENDS,
          })}
        />
        <Stat
          label={t("extraCodes")}
          value={dashboard.bonusCodes.toLocaleString("en-US")}
        />
      </div>
      {(dashboard.waiting > 0 || atCap || dashboard.rewardedAsFriend) && (
        <div className="text-muted-foreground space-y-1.5 px-5 pb-5 text-sm text-pretty sm:px-6">
          {dashboard.waiting > 0 && (
            <p>
              {t("waiting", {
                waiting: dashboard.waiting,
                days: INVITE_QUALIFY_DAYS,
              })}
            </p>
          )}
          {atCap && (
            <p>
              {t("atCap", {
                max: INVITE_MAX_REWARDED_FRIENDS,
                count: INVITE_BONUS_CODES,
              })}
            </p>
          )}
          {dashboard.rewardedAsFriend && (
            <p>{t("youWereInvited", { count: INVITE_BONUS_CODES })}</p>
          )}
        </div>
      )}
    </SettingsSection>
  );
}

async function Rules() {
  const t = await getAppTranslations("app.settings.inviteFriends.page");
  const link = (href: string) => (chunks: ReactNode) => (
    <Link className="text-foreground underline underline-offset-2" href={href}>
      {chunks}
    </Link>
  );
  const rules = [
    t("ruleSignUp"),
    t("ruleFirstCode", {
      count: INVITE_BONUS_CODES,
      days: INVITE_QUALIFY_DAYS,
    }),
    t("ruleCap", {
      max: INVITE_MAX_REWARDED_FRIENDS,
      total: INVITE_MAX_INVITER_CODES,
      count: INVITE_BONUS_CODES,
    }),
    t("ruleNotYourself"),
    t("ruleAllowance"),
    t("rulePrivate"),
  ];
  return (
    <SettingsSection id="rules" title={t("howItWorks")}>
      <div className="space-y-3 px-5 py-5 text-sm sm:px-6">
        <ul className="list-disc space-y-1.5 pl-5 text-pretty">
          {rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <p className="text-muted-foreground text-pretty">
          {t.rich("ruleEnd", {
            terms: link("/legal/terms-of-service#invite-rewards"),
            help: link("/docs/help/account-and-billing/invite-rewards"),
          })}
        </p>
      </div>
    </SettingsSection>
  );
}
