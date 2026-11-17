import { requestInvoiceAction } from "@/actions/invoice-requests";
import { pricingRequestRoute } from "@/lib/widget-routes/pricing-requests";

/**
 * /pricing's "Pay by invoice" dialog
 * (components/sections/pricing/invoice-request-dialog.tsx) for pages that
 * can't call this app's server actions. Runs requestInvoiceAction: the
 * session, its rate limit, the workspace, validation and the email are the
 * action's.
 */
export function POST(req: Request) {
  return pricingRequestRoute(req, requestInvoiceAction);
}
