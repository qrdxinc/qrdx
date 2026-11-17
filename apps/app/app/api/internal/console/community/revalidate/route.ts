import { z } from "zod";
import { refreshCommunityAll } from "@/app/(app)/admin/_lib/operations";
import { consoleInternalRoute } from "@/lib/console-internal/route";

// POST from the back-office console: refreshes the community gallery's cached
// lists after the console took a theme or item down (it can't revalidate
// this app's cache itself).
// Signed, with the admin checked again here (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";

export const POST = consoleInternalRoute({
  schema: z.object({}),
  run: async () => {
    refreshCommunityAll();
    return null;
  },
});
