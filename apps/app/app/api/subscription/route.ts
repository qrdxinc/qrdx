import type { NextRequest } from "next/server";
import { handleError } from "@/lib/error-response";
import { planForSubscription } from "@/lib/plans";
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
// copy; components/sections/pricing-section.tsx). Only this app's own pages
// call it (a same-origin fetch), so another site's page is refused, and no
// cache keeps an answer. The subscription is read once for both.
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
    };

    return jsonResponse(response);
  } catch (error) {
    const response = handleError(error, { route: "/api/subscription" });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
