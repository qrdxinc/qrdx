import { banSchema } from "@/app/(app)/admin/_lib/schemas";
import { consoleInternalRoute } from "@/lib/console-internal/route";
import { banUserForConsole } from "@/lib/console-internal/users";

// POST from the back-office console: bans a user, as banUserAction (Better Auth's ban, sessions
// deleted, community lists refreshed).
// Signed, with the admin checked again here (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";

export const POST = consoleInternalRoute({
  schema: banSchema,
  run: (input, { actor }) => banUserForConsole(actor, input),
});
