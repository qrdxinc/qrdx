import { blockReportedFile } from "@/app/(app)/admin/_lib/operations";
import { blockFileSchema } from "@/app/(app)/admin/_lib/schemas";
import { consoleInternalRoute } from "@/lib/console-internal/route";

// POST from the back-office console: blocks a reported file (takedown) and actions the
// report, as blockReportedFileAction.
// Signed, with the admin checked again here (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";

export const POST = consoleInternalRoute({
  action: "abuse_report.block_file",
  schema: blockFileSchema,
  run: (input, { actor }) => blockReportedFile(actor, input),
});
