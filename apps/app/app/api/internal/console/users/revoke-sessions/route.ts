import { userReasonSchema } from "@/app/(app)/admin/_lib/schemas";
import { requireStrongConsoleActor } from "@/lib/console-internal/actor";
import { consoleInternalRoute } from "@/lib/console-internal/route";
import { revokeUserSessionsForConsole } from "@/lib/console-internal/users";

// POST from the back-office console: signs a user out everywhere, as
// revokeUserSessionsAction. Strong confirmation required when the user is
// an admin.
// Signed, with the admin checked again here (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";

export const POST = consoleInternalRoute({
  action: "user.revoke_sessions",
  schema: userReasonSchema,
  run: (input, { actor }) =>
    revokeUserSessionsForConsole(actor, input, {
      requireStrong: () => requireStrongConsoleActor(actor),
    }),
});
