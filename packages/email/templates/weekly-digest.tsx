import type { EmailIntl } from "../intl";
import { EmailButton, EmailHeading, EmailLayout, EmailText } from "./layout";
import {
  formatCount,
  formatEmailDate,
  MutedText,
  RankedList,
  SectionTitle,
  StatGrid,
} from "./parts";

export interface WeeklyDigestEmailProps {
  workspaceName: string;
  /** Inclusive start, exclusive end (UTC) */
  periodStart: Date | string;
  periodEnd: Date | string;
  scans: number;
  previousScans: number;
  uniqueVisitors: number;
  newCodes: number;
  formResponses: number;
  topCodes: { label: string; scans: number; url: string }[];
  topCountries: { country: string; scans: number }[];
  dashboardUrl: string;
  unsubscribeUrl: string;
  /** The address it's sent to (the footer names it) */
  recipient?: string;
  /** The recipient's language */
  intl: EmailIntl;
}

function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The change from the week before in whole percent; null without a baseline. */
const percentChange = (current: number, previous: number) =>
  previous === 0 ? null : Math.round(((current - previous) / previous) * 100);

/** "+12%" / "-5%" vs the week before; null without a baseline. */
export function weekOverWeek(
  current: number,
  previous: number,
  { t, locale }: EmailIntl
): string | null {
  const change = percentChange(current, previous);
  if (change === null) {
    return current > 0 ? t("weeklyDigest.newThisWeek") : null;
  }
  if (change === 0) return t("weeklyDigest.sameAsLastWeek");
  const percent = new Intl.NumberFormat(locale, {
    style: "percent",
    signDisplay: "exceptZero",
  });
  return t("weeklyDigest.change", { change: percent.format(change / 100) });
}

export function WeeklyDigestEmail({
  workspaceName,
  periodStart,
  periodEnd,
  scans,
  previousScans,
  uniqueVisitors,
  newCodes,
  formResponses,
  topCodes,
  topCountries,
  dashboardUrl,
  unsubscribeUrl,
  recipient,
  intl,
}: WeeklyDigestEmailProps) {
  const { t, locale } = intl;
  const count = (value: number) => formatCount(value, locale);
  const lastDay = new Date(new Date(periodEnd).getTime() - 1);
  const period = `${formatEmailDate(periodStart, locale)} – ${formatEmailDate(lastDay, locale)}`;
  return (
    <EmailLayout
      intl={intl}
      preview={t("weeklyDigest.preview", { scans, workspace: workspaceName })}
      recipient={recipient}
      reason={t("weeklyDigest.reason", { workspace: workspaceName })}
      unsubscribeUrl={unsubscribeUrl}
    >
      <EmailHeading>{t("weeklyDigest.heading")}</EmailHeading>
      <EmailText>
        {workspaceName} · {period}
      </EmailText>
      <StatGrid
        stats={[
          {
            label: t("weeklyDigest.scans"),
            value: count(scans),
            delta: weekOverWeek(scans, previousScans, intl),
            down: (percentChange(scans, previousScans) ?? 0) < 0,
          },
          {
            label: t("weeklyDigest.uniqueVisitors"),
            value: count(uniqueVisitors),
          },
          {
            label:
              formResponses > 0
                ? t("weeklyDigest.formResponses")
                : t("weeklyDigest.newCodes"),
            value: count(formResponses > 0 ? formResponses : newCodes),
          },
        ]}
      />

      {topCodes.length > 0 ? (
        <>
          <SectionTitle>{t("weeklyDigest.topCodes")}</SectionTitle>
          <RankedList
            labelHeading={t("weeklyDigest.code")}
            rows={topCodes.map((code) => ({
              label: code.label,
              href: code.url,
              value: count(code.scans),
            }))}
            valueHeading={t("weeklyDigest.scans")}
          />
        </>
      ) : null}

      {topCountries.length > 0 ? (
        <>
          <SectionTitle>{t("weeklyDigest.countries")}</SectionTitle>
          <RankedList
            labelHeading={t("weeklyDigest.country")}
            rows={topCountries.map((row) => ({
              label: countryName(row.country, locale),
              value: count(row.scans),
            }))}
            valueHeading={t("weeklyDigest.scans")}
          />
        </>
      ) : null}

      {formResponses > 0 && newCodes > 0 ? (
        <MutedText>
          {t("weeklyDigest.newCodesLine", { count: newCodes })}
        </MutedText>
      ) : null}

      <EmailButton href={dashboardUrl}>{t("weeklyDigest.open")}</EmailButton>
    </EmailLayout>
  );
}

/** What the preview app (apps/email) renders. */
WeeklyDigestEmail.PreviewProps = {
  workspaceName: "Acme",
  periodStart: new Date("2026-11-09T00:00:00Z"),
  periodEnd: new Date("2026-11-16T00:00:00Z"),
  scans: 1284,
  previousScans: 1102,
  uniqueVisitors: 917,
  newCodes: 3,
  formResponses: 12,
  topCodes: [
    {
      label: "Spring menu",
      scans: 640,
      url: "https://qrdx.dev/dashboard/acme/codes/aB3dE5f",
    },
    {
      label: "Table tents",
      scans: 388,
      url: "https://qrdx.dev/dashboard/acme/codes/k9Lm2Pq",
    },
  ],
  topCountries: [
    { country: "DE", scans: 702 },
    { country: "US", scans: 311 },
  ],
  dashboardUrl: "https://qrdx.dev/dashboard/acme",
  unsubscribeUrl: "https://qrdx.dev/api/email/unsubscribe?token=preview.token",
  recipient: "alex@example.com",
} satisfies Omit<WeeklyDigestEmailProps, "intl">;
