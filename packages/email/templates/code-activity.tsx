import type { EmailIntl } from "../intl";
import { EmailButton, EmailHeading, EmailLayout, EmailText } from "./layout";
import { codeLabel, DetailsTable } from "./parts";

export interface CodeActivityEmailProps {
  kind: "created" | "updated";
  code: {
    title: string | null;
    slug: string;
    shortLink: string;
    destination: string;
  };
  /** Human-readable changed fields ("Destination", "Title", ...) */
  changes?: string[];
  actorName?: string | null;
  codeUrl: string;
  workspaceName: string;
  unsubscribeUrl: string;
  /** The recipient's language */
  intl: EmailIntl;
}

export function CodeActivityEmail({
  kind,
  code,
  changes = [],
  actorName,
  codeUrl,
  workspaceName,
  unsubscribeUrl,
  intl,
}: CodeActivityEmailProps) {
  const { t } = intl;
  const label = codeLabel(code);
  const who = actorName?.trim() || t("codeActivity.someone");
  const heading = t(`codeActivity.${kind}.heading`, { code: label });
  const rows = [
    { label: t("codeActivity.shortLink"), value: code.shortLink },
    { label: t("codeActivity.opens"), value: code.destination },
    ...(changes.length > 0
      ? [{ label: t("codeActivity.changed"), value: changes.join(", ") }]
      : []),
  ];
  return (
    <EmailLayout
      intl={intl}
      preview={heading}
      reason={t(`codeActivity.${kind}.reason`, { workspace: workspaceName })}
      unsubscribeUrl={unsubscribeUrl}
    >
      <EmailHeading>{heading}</EmailHeading>
      <EmailText>
        {t(`codeActivity.${kind}.body`, { who, workspace: workspaceName })}
      </EmailText>
      <DetailsTable rows={rows} />
      <EmailButton href={codeUrl}>{t("codeActivity.open")}</EmailButton>
    </EmailLayout>
  );
}

/** What the preview app (apps/email) renders. */
CodeActivityEmail.PreviewProps = {
  kind: "updated",
  code: {
    title: "Spring menu",
    slug: "aB3dE5f",
    shortLink: "https://qrdx.dev/q/aB3dE5f",
    destination: "https://example.com/menu/spring",
  },
  changes: ["Destination", "Title"],
  actorName: "Sam Lee",
  codeUrl: "https://qrdx.dev/dashboard/acme/codes/aB3dE5f",
  workspaceName: "Acme",
  unsubscribeUrl: "https://qrdx.dev/api/email/unsubscribe?token=preview.token",
} satisfies Omit<CodeActivityEmailProps, "intl">;
