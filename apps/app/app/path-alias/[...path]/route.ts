import type { NextRequest } from "next/server";
import {
  CUSTOM_DOMAIN_HEADER,
  isCustomDomainRequest,
} from "@/app/(app)/dashboard/domains/_lib/hostname";
import { resolveShortLink } from "@/app/q/[slug]/resolve";
import { statusPage } from "@/app/q/[slug]/status-page";
import { scanPagesIntlFor } from "@/lib/i18n/scan-pages";
import { aliasPathOf } from "@/lib/path-aliases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Path aliases on a verified custom domain (lib/path-aliases.ts): an exact
// legacy path another provider printed (`https://<domain>/r/abc`) opens the
// alias's code and counts a scan like its short link. proxy.ts rewrites
// those paths here (host-routing.ts) and tags the request with the domain
// id. On QRdx's shared host no alias ever resolves.

type Context = { params: Promise<{ path: string[] }> };

async function resolve(
  request: NextRequest,
  { params }: Context,
  record: boolean,
): Promise<Response> {
  const domainId = request.headers.get(CUSTOM_DOMAIN_HEADER);
  const { path } = await params;
  const alias = aliasPathOf(
    `/${path.map((part) => encodeURIComponent(part)).join("/")}`,
  );
  if (!(domainId && alias && isCustomDomainRequest(request.headers))) {
    return statusPage("not-found", { intl: await scanPagesIntlFor(request) });
  }
  return resolveShortLink(request, { alias, domainId }, { record });
}

export function GET(request: NextRequest, context: Context) {
  return resolve(request, context, true);
}

export function HEAD(request: NextRequest, context: Context) {
  return resolve(request, context, false);
}

/** Password gate submissions; the GET that showed the gate counted the scan. */
export function POST(request: NextRequest, context: Context) {
  return resolve(request, context, false);
}
