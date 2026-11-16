import { resendTeamInvitation } from "@/app/(app)/admin/_lib/operations";
import { invitationSchema } from "@/app/(app)/admin/_lib/schemas";
import { consoleInternalRoute } from "@/lib/console-internal/route";

// POST from the back-office console: sends a team invitation again, as
// resendInvitationAction.
// Signed, with the admin checked again here (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";

export const POST = consoleInternalRoute({
  schema: invitationSchema,
  run: (input, { actor }) => resendTeamInvitation(actor, input),
});
