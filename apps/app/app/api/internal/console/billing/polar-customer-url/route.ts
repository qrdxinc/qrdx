import { z } from "zod";
import { getPolarCustomerUrl } from "@/app/(app)/admin/_lib/polar";
import { adminId } from "@/app/(app)/admin/_lib/rules";
import { consoleInternalRoute } from "@/lib/console-internal/route";

// POST from the back-office console: the customer's page in the Polar
// dashboard, which needs this app's Polar token to name the organization.
// Signed, with the admin checked again here (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";

export const POST = consoleInternalRoute({
  schema: z.object({ customerId: adminId }),
  run: async ({ customerId }) => ({
    data: { url: await getPolarCustomerUrl(customerId) },
  }),
});
