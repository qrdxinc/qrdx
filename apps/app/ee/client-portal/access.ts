import "server-only";

import { HttpError } from "@/lib/error-response";
import { isFeatureAvailable } from "@/lib/feature-availability";
import type { PlanLimits } from "@/lib/plans";

// Who gets the client portal and client-branded stats pages (agency tools).
// They're in ee/ under the QRdx commercial licence: a workspace has them when
// the server has the licence key (packages/availability/rules.ts
// "clientPortal") AND its plan includes them (lib/plans.ts): client branding
// on Pro and Business; no QRdx mark, stats links on a custom domain and the
// portal on Business. Every check of those plan flags goes through here.

/** The server has the licence for the client portal and client reports. */
export const isClientPortalAvailable = () => isFeatureAvailable("clientPortal");

type ClientLimits = Pick<
  PlanLimits,
  "clientReports" | "clientReportsWhiteLabel" | "clientPortal"
>;

/** What a plan's limits give here: nothing at all without the licence. */
export function clientTools(limits: ClientLimits): ClientLimits {
  const on = isClientPortalAvailable();
  return {
    clientReports: on && limits.clientReports,
    clientReportsWhiteLabel: on && limits.clientReportsWhiteLabel,
    clientPortal: on && limits.clientPortal,
  };
}

/** 404 where the client portal doesn't exist (no licence key). */
export function requireClientPortal(): void {
  if (!isClientPortalAvailable()) {
    throw new HttpError(
      404,
      "NOT_FOUND",
      "The client portal isn't available on this server.",
    );
  }
}

/** 404 where client branding doesn't exist (no licence key). */
export function requireClientBranding(): void {
  if (!isClientPortalAvailable()) {
    throw new HttpError(
      404,
      "NOT_FOUND",
      "Client branding isn't available on this server.",
    );
  }
}
