import { SUPPORT_EMAIL } from "@repo/config";
import type { ReactNode } from "react";
import { Link } from "react-email";
import type { EmailIntl } from "../intl";
import { baseUrl } from "../origin";
import { EmailButton, EmailText } from "./layout";
import { DetailsTable } from "./parts";

// Shared by every security email (two-step verification, passkeys, email
// changes, new sign-ins, confirmation codes): where and when it happened,
// the way to the security settings, and the support address.

/** Settings → Profile & security, at Two-step verification. */
export const reviewSecurityUrl = () =>
  new URL("/settings/account#two-factor", baseUrl).toString();

/**
 * Where and when a security event happened. The senders fill it from the
 * request (apps/app/lib/security/request-details.ts).
 */
export interface SecurityEventDetails {
  /** "Chrome on macOS" */
  device: string | null;
  /** "Mumbai, India" (approximate); null when unknown */
  location: string | null;
  ip: string | null;
  /** "Nov 7, 2026, 3:04 PM GMT+5:30" */
  time: string;
  /**
   * Who made the change when it wasn't the account holder, e.g. "QRdx
   * support". Shown instead of the device, place and address, which would
   * be theirs.
   */
  actor?: string | null;
}

/**
 * Device, approximate location, IP address and time, as label/value rows.
 * Nothing without details (a template rendered outside a sender).
 */
export function SecurityDetails({
  details,
  extra = [],
  intl,
}: {
  details: SecurityEventDetails | undefined;
  /** Rows after the device's, e.g. how someone signed in */
  extra?: { label: string; value: string }[];
  intl: EmailIntl;
}) {
  if (!details) return null;
  const { t } = intl;
  const rows = details.actor
    ? [{ label: t("security.by"), value: details.actor }]
    : [
        details.device
          ? { label: t("security.device"), value: details.device }
          : null,
        details.location
          ? { label: t("security.location"), value: details.location }
          : null,
        details.ip ? { label: t("security.ip"), value: details.ip } : null,
      ];
  return (
    <DetailsTable
      rows={[
        ...rows.filter((row) => row !== null),
        ...extra,
        { label: t("security.time"), value: details.time },
      ]}
    />
  );
}

export function ReviewSecurityButton({ intl }: { intl: EmailIntl }) {
  return (
    <EmailButton href={reviewSecurityUrl()}>
      {intl.t("security.review")}
    </EmailButton>
  );
}

/** On every email that carries a code. */
export function NeverAskForCode({ intl }: { intl: EmailIntl }) {
  return <EmailText>{intl.t("codes.neverAsk")}</EmailText>;
}

/** The arguments of "…contact support at <support>{email}</support>…". */
export const supportLinkArgs = {
  email: SUPPORT_EMAIL,
  support: (chunks: ReactNode) => (
    <Link href={`mailto:${SUPPORT_EMAIL}`}>{chunks}</Link>
  ),
};
