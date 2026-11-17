import { authClient } from "@repo/auth/client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import type { SubscriptionSummary } from "@/types/subscription";

async function fetchSubscriptionStatus(): Promise<SubscriptionSummary> {
  const res = await apiFetch("/api/subscription", { method: "GET" });

  if (!res.ok) {
    throw new Error("Failed to fetch subscription status");
  }

  return res.json();
}

export const SUBSCRIPTION_STATUS_QUERY_KEY = "subscriptionStatus";

/**
 * The signed-in visitor's subscription (GET /api/subscription): the AI
 * request allowance and their plan. Nothing is fetched while signed out,
 * or with `enabled: false` (a caller that already has what it needs).
 */
export function useSubscription({
  enabled = true,
}: {
  enabled?: boolean;
} = {}) {
  const { data: session } = authClient.useSession();
  const isLoggedIn = !!session?.user.id;

  const { data: subscriptionStatus, ...query } = useQuery({
    queryKey: [SUBSCRIPTION_STATUS_QUERY_KEY],
    queryFn: fetchSubscriptionStatus,
    enabled: enabled && isLoggedIn,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });

  return { subscriptionStatus, ...query };
}
