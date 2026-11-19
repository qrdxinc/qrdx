import { Column, Link, Row, Section } from "react-email";
import type { EmailIntl } from "../intl";
import {
  EMAIL_ACCENT,
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailText,
} from "./layout";
import {
  formatCount,
  formatEmailDate,
  MutedText,
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

const rowStyle = {
  borderBottom: "1px solid #f0f0f0",
  color: "#0a0a0a",
  fontSize: "14px",
  lineHeight: "20px",
  padding: "8px 0",
} as const;

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
          <Section>
            {topCodes.map((code) => (
              <Row key={code.url}>
                <Column style={rowStyle}>
                  <Link href={code.url} style={{ color: EMAIL_ACCENT }}>
                    {code.label}
                  </Link>
                </Column>
                <Column style={{ ...rowStyle, textAlign: "right" }}>
                  {count(code.scans)}
                </Column>
              </Row>
            ))}
          </Section>
        </>
      ) : null}

      {topCountries.length > 0 ? (
        <>
          <SectionTitle>{t("weeklyDigest.countries")}</SectionTitle>
          <MutedText>
            {topCountries
              .map(
                (row) =>
                  `${countryName(row.country, locale)} ${count(row.scans)}`
              )
              .join(" · ")}
          </MutedText>
        </>
      ) : null}

      {formResponses > 0 && newCodes > 0 ? (
        <MutedText>
          {t("weeklyDigest.newCodesLine", { count: newCodes })}
        </MutedText>
      ) : null}

      <Section style={{ marginTop: "20px" }}>
        <EmailButton href={dashboardUrl}>{t("weeklyDigest.open")}</EmailButton>
      </Section>
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
} satisfies Omit<WeeklyDigestEmailProps, "intl">;
