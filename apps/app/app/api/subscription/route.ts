import type { NextRequest } from "next/server";
import { handleError } from "@/lib/error-response";
import { can } from "@/lib/permissions";
import { planForSubscription } from "@/lib/plans";
import { chargedCurrency } from "@/lib/region";
import { getActiveScope } from "@/lib/scope";
import { getCurrentUserId } from "@/lib/shared";
import { subscriptionAndUsage } from "@/lib/subscription";
import {
  crossOriginRead,
  isSameOriginRead,
  jsonResponse,
} from "@/lib/widget-routes/server";
import type { SubscriptionSummary } from "@/types/subscription";

// The signed-in visitor's subscription: the AI request allowance
// (lib/hooks/use-subscription.ts) and their own plan, which /pricing reads in
// the browser where the page has no plan of its own (the marketing site's
// copy; components/sections/pricing-section.tsx), plus the currency checkout
// would charge them (the in-app upgrade buttons, components/billing). Only
// this app's own pages call it (a same-origin fetch), so another site's page
// is refused, and no cache keeps an answer. The subscription is read once for
// both.
export async function GET(request: NextRequest) {
  if (!isSameOriginRead(request)) return crossOriginRead();
  try {
    const userId = await getCurrentUserId(request);
    const {
      check: { isSubscribed, requestsRemaining, requestsUsed },
      subscription,
    } = await subscriptionAndUsage(userId);

    const response: SubscriptionSummary = {
      isSubscribed,
      requestsRemaining,
      requestsUsed,
      plan: planForSubscription(subscription),
      currency: chargedCurrency(request.headers),
      canUpgradeWorkspace: await upgradesWorkspace(request.headers),
    };

    return jsonResponse(response);
  } catch (error) {
    const response = handleError(error, { route: "/api/subscription" });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}

/**
 * Whether the person's purchase lifts the plan of the workspace the request
 * names (the open tab's, else their default): the upgrade buttons of
 * workspace gates outside the app shell ask (components/billing). Null when
 * it can't be read (a workspace they've left, one that shuts them out).
 */
async function upgradesWorkspace(headers: Headers): Promise<boolean | null> {
  try {
    return can((await getActiveScope(headers)).role, "billing.manage");
  } catch {
    return null;
  }
}
