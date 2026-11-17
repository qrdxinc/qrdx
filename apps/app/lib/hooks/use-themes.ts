"use client";

import { authClient } from "@repo/auth/client";
import { useQuery } from "@tanstack/react-query";
import { fetchSavedThemes } from "@/lib/widget-routes/client";

/**
 * The signed-in visitor's saved themes (GET /api/themes), for the bulk
 * tool's style picker. Nothing is fetched while signed out; until the list
 * arrives, and on an error, it's an empty list (`isPlaceholderData`,
 * `isError` tell those apart).
 */
export function useQRThemes() {
  const { data: session } = authClient.useSession();

  return useQuery({
    queryKey: ["themes"],
    queryFn: fetchSavedThemes,
    enabled: !!session?.user, // Only fetch when authenticated
    retry: false,
    // Return empty array on error or when not authenticated
    placeholderData: [],
  });
}
