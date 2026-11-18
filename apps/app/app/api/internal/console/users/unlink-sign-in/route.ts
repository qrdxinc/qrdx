import { unlinkSignInMethod } from "@/app/(app)/admin/_lib/operations";
import { unlinkSchema } from "@/app/(app)/admin/_lib/schemas";
import { requireStrongConsoleActor } from "@/lib/console-internal/actor";
import { consoleInternalRoute } from "@/lib/console-internal/route";

// POST from the back-office console: unlinks a sign-in method (never the last), as
// unlinkSignInMethodAction. Strong confirmation required when the user is an
// admin.
// Signed, with the admin checked again here (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";

export const POST = consoleInternalRoute({
  action: "user.unlink_sign_in",
  schema: unlinkSchema,
  run: (input, { actor }) =>
    unlinkSignInMethod(actor, input, {
      requireStrong: () => requireStrongConsoleActor(actor),
    }),
});
