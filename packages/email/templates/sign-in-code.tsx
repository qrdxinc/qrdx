import type { EmailIntl } from "../intl";
import { EmailCode, EmailHeading, EmailLayout, EmailText } from "./layout";
import { MutedText } from "./parts";
import { NeverAskForCode } from "./security-parts";

export const SIGN_IN_CODE_SUBJECT = "Your QRdx sign-in code";

/** The subject line in the recipient's language. */
export const signInCodeSubject = (intl: EmailIntl) =>
  intl.t("signInCode.subject");

export interface SignInCodeEmailProps {
  /** The 6-digit code */
  code: string;
  expiresInMinutes?: number;
  /** Where the code was asked for, approximately ("Mumbai, India") */
  location?: string | null;
  /** The address it's sent to */
  recipient?: string;
  /** The recipient's language */
  intl: EmailIntl;
}

/** Transactional: the one-time code for signing in with email. No links. */
export function SignInCodeEmail({
  code,
  expiresInMinutes = 5,
  location = null,
  recipient,
  intl,
}: SignInCodeEmailProps) {
  const { t } = intl;
  return (
    <EmailLayout
      intl={intl}
      preview={t("signInCode.preview", { minutes: expiresInMinutes })}
      reason={t("signInCode.reason")}
      recipient={recipient}
    >
      <EmailHeading>{t("signInCode.heading")}</EmailHeading>
      <EmailText>{t("signInCode.enter")}</EmailText>
      <EmailCode code={code} />
      <EmailText>{t("codes.expires", { minutes: expiresInMinutes })}</EmailText>
      <NeverAskForCode intl={intl} />
      {/* Where it was asked for sits with what to do if it wasn't them. */}
      <MutedText>
        {location ? `${t("signInCode.location", { location })} ` : null}
        {t("signInCode.ignore")}
      </MutedText>
    </EmailLayout>
  );
}

/** What the preview app (apps/email) renders. */
SignInCodeEmail.PreviewProps = {
  code: "482913",
  expiresInMinutes: 5,
  location: "Mumbai, India",
  recipient: "alex@example.com",
} satisfies Omit<SignInCodeEmailProps, "intl">;
