import { disconnectIntegration } from "@/app/(app)/admin/_lib/operations";
import { integrationSchema } from "@/app/(app)/admin/_lib/schemas";
import { consoleInternalRoute } from "@/lib/console-internal/route";

// POST from the back-office console: disconnects an integration (token revoked
// where possible, cleanup, row deleted), as disconnectIntegrationAction.
// Signed, with the admin checked again here (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";

export const POST = consoleInternalRoute({
  schema: integrationSchema,
  run: (input, { actor }) => disconnectIntegration(actor, input),
});
