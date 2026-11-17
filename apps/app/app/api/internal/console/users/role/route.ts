import { ADMIN_ROLE } from "@repo/auth/admin";
import { roleSchema } from "@/app/(app)/admin/_lib/schemas";
import { requireStrongConsoleActor } from "@/lib/console-internal/actor";
import { consoleInternalRoute } from "@/lib/console-internal/route";
import { setUserRoleForConsole } from "@/lib/console-internal/users";

// POST from the back-office console: sets a user's role, as setUserRoleAction. Granting
// the admin role also needs the admin's strong confirmation here, which the
// admin page doesn't ask for: it hands over access to the console.
// Signed, with the admin checked again here (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";

export const POST = consoleInternalRoute({
  action: "user.set_role",
  schema: roleSchema,
  strong: (input) => input.role === ADMIN_ROLE,
  run: (input, { actor }) =>
    setUserRoleForConsole(actor, input, {
      requireStrong: () => requireStrongConsoleActor(actor),
    }),
});
