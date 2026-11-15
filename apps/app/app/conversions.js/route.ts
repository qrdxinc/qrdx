import { conversionsScript } from "@/ee/conversions/script";

// The conversion tracking script for customers' sites (ee/conversions, QRdx
// commercial licence). Answered per request, so it follows the licence key
// the server runs with, not the build's: a 404 without a valid key, and from
// the moment a key runs out (packages/auth/ee/license.ts).
export const dynamic = "force-dynamic";

export function GET() {
  return conversionsScript();
}
