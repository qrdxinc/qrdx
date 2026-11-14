import type { EeLicenseState } from "@repo/auth/license";

// The ee licence key as /admin/health shows it (./health.ts). The key is
// checked offline by packages/auth/ee/license.ts; this only words the result,
// with names and dates, never the key.

export interface LicenceProbe {
  status: "ok" | "warn" | "error" | "off";
  detail: string;
}

const EE_FEATURE_NAMES = { sso: "single sign-on", auditLog: "the audit log" };
const DAY_MS = 24 * 60 * 60 * 1000;
// A licence this close to its expiry shows as a warning.
const EXPIRY_WARNING_DAYS = 30;

const day = (date: Date) => date.toISOString().slice(0, 10);

/** What /admin/health says about the licence in `state`. */
export function licenceProbe(
  state: EeLicenseState,
  now: Date = new Date(),
): LicenceProbe {
  const both = "single sign-on and the audit log";
  if (state.status === "missing") {
    return {
      status: "off",
      detail: `QRDX_EE_LICENSE not set: ${both} are off`,
    };
  }
  if (state.status === "invalid") {
    return {
      status: "error",
      detail:
        state.problem === "no-public-key"
          ? `This build has no licence public key: ${both} are off`
          : `Licence key is not valid: ${both} are off`,
    };
  }
  const { licence, offAt } = state;
  const expired = day(licence.expiresAt);
  if (state.status === "grace") {
    return {
      status: "warn",
      detail: `Licence expired on ${expired}: ${both} switch off on ${day(offAt)}`,
    };
  }
  if (state.status === "expired") {
    return {
      status: "error",
      detail: `Licence expired on ${expired}: ${both} are off since ${day(offAt)}`,
    };
  }
  const covers =
    licence.features.length === Object.keys(EE_FEATURE_NAMES).length
      ? ""
      : ` (${licence.features.map((f) => EE_FEATURE_NAMES[f]).join(" and ") || "no features"} only)`;
  const daysLeft = (licence.expiresAt.getTime() - now.getTime()) / DAY_MS;
  return {
    status: daysLeft <= EXPIRY_WARNING_DAYS ? "warn" : "ok",
    detail: `Licence for ${licence.customer} expires on ${expired}${covers}`,
  };
}
