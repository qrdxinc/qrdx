import { z } from "zod";
import { adminError } from "@/app/(app)/admin/_lib/action-runner";
import { adminId } from "@/app/(app)/admin/_lib/rules";
import { consoleInternalRoute } from "@/lib/console-internal/route";
import { settleInviteForCode } from "@/lib/invites/qualify";

// POST from the back-office console, after it switched a code back on (its
// restore of a held or reported code, or its Enable): settles the code's
// owner's invite now (lib/invites/qualify.ts), as this app's own admin
// actions do after the response. The console writes the code itself as its
// database role, but the invite's reward and the inviter's email are this
// app's. It sends the code's id only. Settling again changes nothing, and
// with invites off (or before their tables exist) it does nothing. When an
// invite is rewarded, the admin audit log says so; the console's call
// failing leaves the invite to the worker's daily pass.
// Signed, with the admin checked again here (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";

export const POST = consoleInternalRoute({
  action: "invite.settle",
  schema: z.object({ codeId: adminId }),
  run: async ({ codeId }) => {
    const result = await settleInviteForCode(codeId);
    if (result.outcome === "no_code") {
      throw adminError("QR code not found", 404);
    }
    const data = { outcome: result.outcome };
    if (result.outcome !== "rewarded" || !result.ownerId) return { data };
    return {
      data,
      audit: {
        targetType: "user",
        targetId: result.ownerId,
        subjectUserId: result.ownerId,
        metadata: {
          qrCodeId: codeId,
          inviterRewarded:
            result.inviterUserId !== null && result.inviterSlot !== null,
        },
      },
    };
  },
});
