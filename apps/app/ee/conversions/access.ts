import "server-only";

import { HttpError } from "@/lib/error-response";
import { isFeatureAvailable } from "@/lib/feature-availability";
import type { PlanLimits } from "@/lib/plans";

// Who gets conversion tracking. Like the audit log, it needs both the QRdx
// licence key on the server (packages/availability/rules.ts `conversions`)
// and a plan with `conversions` (Business; lib/plans.ts). Without the key
// the feature is absent: scans get no qrdx_sid (lib/redirect/routing.ts),
// POST /api/v1/conversions answers 404, /conversions.js isn't served and
// the dashboard shows no conversion tracking. Conversions already recorded
// stay in the database and in the account export.

/** The server has the licence and the plan includes conversion tracking. */
export function conversionsAllowed(
  limits: Pick<PlanLimits, "conversions">,
): boolean {
  return isFeatureAvailable("conversions") && limits.conversions;
}

/** What the API and the server actions answer where the feature doesn't exist. */
export function conversionsUnavailable(): HttpError {
  return new HttpError(
    404,
    "NOT_FOUND",
    "Conversion tracking isn't available on this server.",
  );
}
