import { changeAccountEmail } from "@/app/(app)/admin/_lib/operations";
import { changeEmailSchema } from "@/app/(app)/admin/_lib/schemas";
import { requireStrongConsoleActor } from "@/lib/console-internal/actor";
import { consoleInternalRoute } from "@/lib/console-internal/route";

// POST from the back-office console: moves an account to a new address, as
// changeEmailAction. Strong confirmation required.
// Signed, with the admin checked again here (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";

export const POST = consoleInternalRoute({
  action: "user.change_email",
  schema: changeEmailSchema,
  strong: true,
  limit: "sensitive",
  run: (input, { actor }) =>
    changeAccountEmail(actor, input, {
      requireStrong: () => requireStrongConsoleActor(actor),
    }),
});
