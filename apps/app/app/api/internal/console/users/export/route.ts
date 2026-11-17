import { database as db, user } from "@repo/database";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { adminError } from "@/app/(app)/admin/_lib/action-runner";
import { writeAuditLog } from "@/app/(app)/admin/_lib/audit";
import { adminId, requiredReason } from "@/app/(app)/admin/_lib/rules";
import { exportArchiveStream } from "@/lib/account/export/archive";
import { EXPORT_INTRO, exportEntries } from "@/lib/account/export/entries";
import { consoleInternalRoute } from "@/lib/console-internal/route";
import { logError } from "@/lib/log-error";

// POST from the back-office console: one user's data export, the same ZIP
// the user gets from Settings → Account and the admin page's export
// (app/(app)/admin/users/[userId]/export/route.ts), streamed back. Limited
// here to 5 an hour per admin (the sensitive tier, whatever the console
// limits); the audit entry, with the reason, is written here before the
// first byte. Signed, with the admin checked again here
// (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// CSV files stop early past this, so the response finishes within maxDuration.
const BUILD_BUDGET_MS = 240_000;

export const POST = consoleInternalRoute({
  action: "user.export",
  schema: z.object({ userId: adminId, reason: requiredReason }),
  limit: "sensitive",
  run: async ({ userId, reason }, { actor }) => {
    const [target] = await db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!target) throw adminError("User not found", 404);
    // On record before the first byte, as the admin page's export does.
    await writeAuditLog({
      actor,
      action: "user.export",
      targetType: "user",
      targetId: target.id,
      metadata: {
        targetEmail: target.email,
        subjectUserId: target.id,
        reason,
        via: "console",
      },
    });

    const generatedAt = new Date();
    const stream = exportArchiveStream({
      entries: exportEntries(target.id),
      intro: EXPORT_INTRO,
      generatedAt,
      deadline: generatedAt.getTime() + BUILD_BUDGET_MS,
      onError: (cause) =>
        logError(cause as Error, {
          action: "console.export",
          userId: target.id,
        }),
    });
    const day = generatedAt.toISOString().slice(0, 10);

    return new Response(stream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="qrdx-data-${target.id}-${day}.zip"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
});
