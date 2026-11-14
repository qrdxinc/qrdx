// The QRdx licence key for the `ee/` features (under the QRdx commercial
// licence). QRdx issues it with an
// enterprise agreement: a signed key with an expiry, checked offline against
// QRdx's public key (./ee/license.ts, server-only). Nothing is ever checked
// over the network. These names are pure and client-safe: the app's feature
// rules (packages/availability/rules.ts) and the auth server read them.

export const EE_LICENSE_ENV = "QRDX_EE_LICENSE";

/**
 * The features a licence can turn on, by the names a key's `features` list
 * uses (the same ids as packages/availability): workspace single sign-on,
 * the audit log, the client portal and client reports, white-label pages
 * with custom CSS, and conversion tracking. A key that lists none covers all.
 */
export const EE_FEATURES = [
  "sso",
  "auditLog",
  "clientPortal",
  "whiteLabel",
  "conversions",
] as const;

export type EeFeature = (typeof EE_FEATURES)[number];

/** Days an expired licence keeps its features on, so a renewal has time. */
export const EE_LICENSE_GRACE_DAYS = 14;
