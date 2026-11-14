import { conversionsScript } from "@/ee/conversions/script";

// The conversion tracking script for customers' sites (ee/conversions, QRdx
// commercial licence). Built once per deploy, like the prerendered pages: a
// 404 on servers without a licence key.
export const dynamic = "force-static";

export function GET() {
  return conversionsScript();
}
