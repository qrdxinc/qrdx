import { startTwoFactorReset } from "@/app/(app)/admin/_lib/operations";
import { userReasonSchema } from "@/app/(app)/admin/_lib/schemas";
import { requireStrongConsoleActor } from "@/lib/console-internal/actor";
import { consoleInternalRoute } from "@/lib/console-internal/route";

// POST from the back-office console: starts support's 7-day turn-off of two-step
// verification, as resetTwoFactorAction. Strong confirmation required.
// Signed, with the admin checked again here (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";

export const POST = consoleInternalRoute({
  action: "user.reset_two_factor",
  schema: userReasonSchema,
  strong: true,
  run: (input, { actor }) =>
    startTwoFactorReset(actor, input, {
      requireStrong: () => requireStrongConsoleActor(actor),
    }),
});
