import { type NextRequest, NextResponse } from "next/server";
import { handleError } from "@/lib/error-response";
import { getPlan } from "@/lib/plans";
import { getCurrentUserId } from "@/lib/shared";
import { validateSubscriptionAndUsage } from "@/lib/subscription";
import type { SubscriptionSummary } from "@/types/subscription";

// The signed-in visitor's subscription: the AI request allowance
// (lib/hooks/use-subscription.ts) and their own plan, which /pricing reads in
// the browser (components/sections/pricing-section.tsx) so any zone on this
// origin can render it.
export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId(request);
    const [{ isSubscribed, requestsRemaining, requestsUsed }, plan] =
      await Promise.all([
        validateSubscriptionAndUsage(userId),
        getPlan(userId),
      ]);

    const response: SubscriptionSummary = {
      isSubscribed,
      requestsRemaining,
      requestsUsed,
      plan,
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleError(error, { route: "/api/subscription" });
  }
}
