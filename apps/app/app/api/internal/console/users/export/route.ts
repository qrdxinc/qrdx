import { database as db, user } from "@repo/database";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { adminError } from "@/app/(app)/admin/_lib/action-runner";
import { adminId } from "@/app/(app)/admin/_lib/rules";
import { exportArchiveStream } from "@/lib/account/export/archive";
import { EXPORT_INTRO, exportEntries } from "@/lib/account/export/entries";
import { consoleInternalRoute } from "@/lib/console-internal/route";
import { logError } from "@/lib/log-error";

// POST from the back-office console: one user's data export, the same ZIP
// the user gets from Settings → Account and the admin page's export
// (app/(app)/admin/users/[userId]/export/route.ts), streamed back. The
// console checks the reason, limits and audits the export before it calls.
// Signed, with the admin checked again here (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// CSV files stop early past this, so the response finishes within maxDuration.
const BUILD_BUDGET_MS = 240_000;

export const POST = consoleInternalRoute({
  schema: z.object({ userId: adminId }),
  run: async ({ userId }) => {
    const [target] = await db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!target) throw adminError("User not found", 404);

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
