import { userReasonSchema } from "@/app/(app)/admin/_lib/schemas";
import { requireStrongConsoleActor } from "@/lib/console-internal/actor";
import { consoleInternalRoute } from "@/lib/console-internal/route";
import { unbanUserForConsole } from "@/lib/console-internal/users";

// POST from the back-office console: lifts a ban, as unbanUserAction.
// Strong confirmation required when the user is an admin.
// Signed, with the admin checked again here (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";

export const POST = consoleInternalRoute({
  action: "user.unban",
  schema: userReasonSchema,
  run: (input, { actor }) =>
    unbanUserForConsole(actor, input, {
      requireStrong: () => requireStrongConsoleActor(actor),
    }),
});
