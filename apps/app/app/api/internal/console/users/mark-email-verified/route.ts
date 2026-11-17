import { markEmailVerified } from "@/app/(app)/admin/_lib/operations";
import { userReasonSchema } from "@/app/(app)/admin/_lib/schemas";
import { requireStrongConsoleActor } from "@/lib/console-internal/actor";
import { consoleInternalRoute } from "@/lib/console-internal/route";

// POST from the back-office console: marks an email verified, as
// markEmailVerifiedAction.
// Signed, with the admin checked again here (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";

export const POST = consoleInternalRoute({
  action: "user.mark_email_verified",
  schema: userReasonSchema,
  run: (input, { actor }) =>
    markEmailVerified(actor, input, {
      requireStrong: () => requireStrongConsoleActor(actor),
    }),
});
