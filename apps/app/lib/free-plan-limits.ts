// The Free plan's dynamic codes and hosted pages. lib/plans.ts reads them as
// PLAN_LIMITS.free.dynamicCodes and .landingPages; they live in this light,
// client-safe module so copy can quote them too: `{facts.freeDynamicCodes}`
// and `{facts.freeHostedPages}` in MDX (lib/product-facts.ts), the way
// lib/scan-history.ts gives copy the Free plan's scan history.

/** Active dynamic codes a Free workspace can have. */
export const FREE_DYNAMIC_CODES = 10;

/** Hosted (landing) pages a Free workspace can have. */
export const FREE_HOSTED_PAGES = 3;
