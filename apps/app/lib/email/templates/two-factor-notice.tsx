import { type EmailIntl, ENGLISH_EMAIL } from "@/lib/i18n/email";
import { EmailDivider, EmailHeading, EmailLayout, EmailText } from "./layout";
import { MutedText } from "./parts";
import {
  ReviewSecurityButton,
  SecurityDetails,
  type SecurityEventDetails,
  supportLinkArgs,
} from "./security-parts";

/** What changed about the account's two-step verification. */
export type TwoFactorNoticeKind =
  | "on"
  | "off"
  | "backup-codes"
  | "app-added"
  | "app-removed"
  | "support-off"
  | "support-reset-scheduled"
  | "support-reset-cancelled"
  | "backup-code-used";

/** What a backup code was used for. */
export type BackupCodeUsedFor = "sign-in" | "confirm";

/** Who cancelled support's pending turn-off. */
export type TwoFactorResetCancelledBy = "person" | "sign-in" | "support";

/**
 * At or below this many backup codes left, the "backup code used" notice
 * suggests making new ones.
 */
export const BACKUP_CODES_LOW = 2;

/** What some notices add to their fixed text. */
export interface TwoFactorNoticeExtra {
  /** "on": every other session of the account was signed out */
  signedOutElsewhere?: boolean;
  /** "backup-code-used": what the code was used for */
  usedFor?: BackupCodeUsedFor;
  /** "backup-code-used": codes left after it; null when unknown */
  codesLeft?: number | null;
  /** "support-reset-scheduled": when it turns off (the email names that UTC day) */
  dueAt?: Date;
  /** "support-reset-cancelled": who cancelled it */
  cancelledBy?: TwoFactorResetCancelledBy;
}

// Each kind's strings under emails.twoFactorNotice in messages/en.json.
const KEYS = {
  on: "on",
  off: "off",
  "backup-codes": "backupCodes",
  "app-added": "appAdded",
  "app-removed": "appRemoved",
  "support-off": "supportOff",
  "support-reset-scheduled": "supportResetScheduled",
  "support-reset-cancelled": "supportResetCancelled",
  "backup-code-used": "backupCodeUsed",
} as const satisfies Record<TwoFactorNoticeKind, string>;

const CANCELLED_BY = {
  person: "byPerson",
  "sign-in": "bySignIn",
  support: "bySupport",
} as const satisfies Record<TwoFactorResetCancelledBy, string>;

export const twoFactorNoticeSubject = (
  kind: TwoFactorNoticeKind,
  intl: EmailIntl = ENGLISH_EMAIL,
) => intl.t(`twoFactorNotice.${KEYS[kind]}.subject`);

/** "November 16, 2026": the UTC day, in the email's language. */
const formatDueDate = (date: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);

/** "You have 3 backup codes left." and, when few are left, what to do. */
export function backupCodesLeftText(
  codesLeft: number,
  intl: EmailIntl = ENGLISH_EMAIL,
): string {
  const { t } = intl;
  const left = t("twoFactorNotice.backupCodeUsed.left", { count: codesLeft });
  return codesLeft <= BACKUP_CODES_LOW
    ? `${left} ${t("twoFactorNotice.backupCodeUsed.makeNew")}`
    : left;
}

/** The notice's paragraphs, before the details table. */
export function twoFactorNoticeLines(
  kind: TwoFactorNoticeKind,
  extra: TwoFactorNoticeExtra = {},
  intl: EmailIntl = ENGLISH_EMAIL,
): string[] {
  const { t } = intl;
  const body = t(`twoFactorNotice.${KEYS[kind]}.body`);
  if (kind === "support-reset-scheduled") {
    return [
      body,
      t("twoFactorNotice.supportResetScheduled.when", {
        hasDate: extra.dueAt ? "yes" : "no",
        date: extra.dueAt ? formatDueDate(extra.dueAt, intl.locale) : "",
      }),
      t("twoFactorNotice.supportResetScheduled.howToStop"),
    ];
  }
  if (kind === "support-reset-cancelled") {
    return [
      extra.cancelledBy
        ? t(
            `twoFactorNotice.supportResetCancelled.${CANCELLED_BY[extra.cancelledBy]}`,
          )
        : body,
      t("twoFactorNotice.supportResetCancelled.staysOn"),
    ];
  }
  if (kind === "backup-code-used") {
    const used =
      extra.usedFor === "confirm"
        ? t("twoFactorNotice.backupCodeUsed.toConfirm")
        : body;
    return typeof extra.codesLeft === "number"
      ? [used, backupCodesLeftText(extra.codesLeft, intl)]
      : [used];
  }
  if (kind === "on" && extra.signedOutElsewhere) {
    return [body, t("twoFactorNotice.signedOutElsewhere")];
  }
  return [body];
}

/** Support's changes: these say themselves what to do. */
export const SUPPORT_KINDS: ReadonlySet<TwoFactorNoticeKind> = new Set([
  "support-off",
  "support-reset-scheduled",
  "support-reset-cancelled",
]);

/** Whether a "backup code used" notice asks the person to act. */
const asksForNewCodes = (
  kind: TwoFactorNoticeKind,
  extra: TwoFactorNoticeExtra,
) =>
  kind === "backup-code-used" &&
  typeof extra.codesLeft === "number" &&
  extra.codesLeft <= BACKUP_CODES_LOW;

/**
 * Transactional, to the account's address after a two-step verification
 * change, with where and when it happened. The only links go to the
 * security settings and support; nothing in it changes the account.
 */
export function TwoFactorNoticeEmail({
  kind,
  details,
  extra = {},
  intl = ENGLISH_EMAIL,
}: {
  kind: TwoFactorNoticeKind;
  /** Where and when; the sender always passes it */
  details?: SecurityEventDetails;
  extra?: TwoFactorNoticeExtra;
  /** The recipient's language */
  intl?: EmailIntl;
}) {
  const { t } = intl;
  const lines = twoFactorNoticeLines(kind, extra, intl);
  return (
    <EmailLayout
      intl={intl}
      preview={lines[0] ?? t(`twoFactorNotice.${KEYS[kind]}.body`)}
      reason={t("twoFactorNotice.reason")}
    >
      <EmailHeading>{t(`twoFactorNotice.${KEYS[kind]}.heading`)}</EmailHeading>
      {lines.map((line) => (
        <EmailText key={line}>{line}</EmailText>
      ))}
      <SecurityDetails details={details} intl={intl} />
      {!SUPPORT_KINDS.has(kind) && !asksForNewCodes(kind, extra) && (
        <EmailText>{t("security.nothingElse")}</EmailText>
      )}
      <ReviewSecurityButton intl={intl} />
      <EmailDivider />
      <MutedText>{t.rich("twoFactorNotice.notYou", supportLinkArgs)}</MutedText>
    </EmailLayout>
  );
}
