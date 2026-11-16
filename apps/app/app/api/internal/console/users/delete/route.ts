import { deleteUserAccount } from "@/app/(app)/admin/_lib/operations";
import { deleteSchema } from "@/app/(app)/admin/_lib/schemas";
import { consoleInternalRoute } from "@/lib/console-internal/route";

// POST from the back-office console: deletes an account, as deleteUserAccountAction.
// Strong confirmation required here, which the admin page doesn't ask for:
// it can't be undone. The organization plugin's calls get no session (the
// admin page's admin isn't a member either), so empty teams are deleted
// afterwards, as there.
// Signed, with the admin checked again here (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";

export const POST = consoleInternalRoute({
  schema: deleteSchema,
  strong: true,
  run: (input, { actor }) =>
    deleteUserAccount(actor, input, { requestHeaders: new Headers() }),
});
