import { getThemes } from "@/actions/qr-themes";
import {
  crossOriginRead,
  isSameOriginRead,
  jsonResponse,
} from "@/lib/widget-routes/server";

/**
 * The signed-in visitor's saved themes, for the bulk tool's style picker
 * (components/sections/tools/bulk-generator.tsx, lib/hooks/use-themes.ts) on
 * pages that can't call this app's server actions. Runs getThemes: the
 * active workspace's themes, or [] when signed out. A failure is a 500, which
 * the picker treats as it treated the action throwing.
 */
export async function GET(req: Request) {
  if (!isSameOriginRead(req)) return crossOriginRead();
  try {
    return jsonResponse(await getThemes());
  } catch {
    // getThemes reported it already.
    return jsonResponse(
      {
        success: false,
        error: { code: "UNKNOWN_ERROR", message: "Couldn't load your themes." },
      },
      500,
    );
  }
}
