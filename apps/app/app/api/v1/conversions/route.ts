import type { NextRequest } from "next/server";
import { conversionPreflight, reportConversion } from "@/ee/conversions/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/conversions (ee/conversions, QRdx commercial licence): a sale
 * or sign-up attributed to the scan that led to it. 404 on servers without
 * a licence key, 402 for workspaces without the plan.
 */
export function POST(request: NextRequest) {
  return reportConversion(request);
}

export function OPTIONS() {
  return conversionPreflight();
}
