import { saveBarcode } from "@/actions/barcodes";
import { actionRoute } from "@/lib/widget-routes/server";

/**
 * /barcode-generator's "Save to dashboard"
 * (components/sections/tools/save-barcode.tsx) for pages that can't call this
 * app's server actions. Runs saveBarcode: the session's workspace, its role
 * check, rate limit, validation and plan limit are the action's.
 */
export function POST(req: Request) {
  return actionRoute(
    req,
    (body) => saveBarcode(body as Parameters<typeof saveBarcode>[0]),
    { created: true },
  );
}
