import { requestNonprofitDiscountAction } from "@/actions/nonprofit-requests";
import { pricingRequestRoute } from "@/lib/widget-routes/pricing-requests";

/**
 * /pricing's non-profit discount dialog
 * (components/sections/pricing/nonprofit-request-dialog.tsx) for pages that
 * can't call this app's server actions. Runs requestNonprofitDiscountAction:
 * the session, its rate limit, the workspace, validation and the email are
 * the action's.
 */
export function POST(req: Request) {
  return pricingRequestRoute(req, requestNonprofitDiscountAction);
}
