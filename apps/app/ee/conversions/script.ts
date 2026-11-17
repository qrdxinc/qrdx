import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import { isFeatureAvailable } from "@/lib/feature-availability";

// /conversions.js (app/conversions.js/route.ts): the browser script customers
// add to their own site (./conversions.js). Served like the public file it
// used to be, and only where the server has the QRdx licence key: elsewhere
// it's a 404, like the API it reports to.

/** Where the script lives, from the app's directory (the build's cwd). */
export const CONVERSIONS_SCRIPT_FILE = "ee/conversions/conversions.js";

// Read once per process: the file only changes with a deploy.
let script: string | undefined;

export function conversionsScript(): Response {
  if (!isFeatureAvailable("conversions")) {
    return new Response("Not found", { status: 404 });
  }
  script ??= readFileSync(
    path.join(process.cwd(), CONVERSIONS_SCRIPT_FILE),
    "utf8",
  );
  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // As Vercel serves files in public/: browsers check for a new copy.
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
