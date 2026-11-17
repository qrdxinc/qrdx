import { requeueImport } from "@/app/(app)/admin/_lib/operations";
import { importSchema } from "@/app/(app)/admin/_lib/schemas";
import { consoleInternalRoute } from "@/lib/console-internal/route";

// POST from the back-office console: puts an import's failed links back in
// the queue, as the admin page's requeueImportAction. The importer's job
// history lives in an integration row, which the console's database role
// can't write. Signed, with the admin checked again here
// (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";

export const POST = consoleInternalRoute({
  action: "import_job.requeue",
  schema: importSchema,
  run: (input, { actor }) => requeueImport(actor, input),
});
