import { cancelImport } from "@/app/(app)/admin/_lib/operations";
import { importSchema } from "@/app/(app)/admin/_lib/schemas";
import { consoleInternalRoute } from "@/lib/console-internal/route";

// POST from the back-office console: stops a stuck import (links already
// made stay), as the admin page's cancelImportAction. The importer's job
// history lives in an integration row, which the console's database role
// can't write. Signed, with the admin checked again here
// (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";

export const POST = consoleInternalRoute({
  action: "import_job.cancel",
  schema: importSchema,
  run: (input, { actor }) => cancelImport(actor, input),
});
