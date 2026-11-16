import { cancelPendingTwoFactorReset } from "@/app/(app)/admin/_lib/operations";
import { userReasonSchema } from "@/app/(app)/admin/_lib/schemas";
import { requireStrongConsoleActor } from "@/lib/console-internal/actor";
import { consoleInternalRoute } from "@/lib/console-internal/route";

// POST from the back-office console: stops a pending two-step verification
// reset, as cancelTwoFactorResetAction. Strong confirmation required.
// Signed, with the admin checked again here (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";

export const POST = consoleInternalRoute({
  schema: userReasonSchema,
  strong: true,
  run: (input, { actor }) =>
    cancelPendingTwoFactorReset(actor, input, {
      requireStrong: () => requireStrongConsoleActor(actor),
    }),
});
