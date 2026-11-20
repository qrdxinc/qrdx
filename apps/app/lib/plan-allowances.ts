// Each plan's REST API requests a day and AI art images a month. lib/plans.ts
// reads them as `apiRequestsPerDay` and `aiArtPerMonth`; they live in this
// light, client-safe module so copy can quote them too: the `{facts.*ApiRequestsPerDay}`
// and `{facts.*AiArtPerMonth}` tokens in MDX (lib/product-facts.ts), the way
// lib/scan-history.ts gives copy each plan's scan history.

import type { Plan } from "./pricing";

/** REST API requests a workspace can make a day (resets at 00:00 UTC). */
export const API_REQUESTS_PER_DAY: Readonly<Record<Plan, number>> = {
  free: 1000,
  pro: 10_000,
  business: 100_000,
};

/** AI art images a calendar month (pooled across a Business team). */
export const AI_ART_PER_MONTH: Readonly<Record<Plan, number>> = {
  free: 3,
  pro: 30,
  business: 150,
};
