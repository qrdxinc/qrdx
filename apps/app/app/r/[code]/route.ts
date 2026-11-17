import { SHADCN_REGISTRY_URL } from "@repo/config";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { isbot } from "isbot";
import { recordReferralClick } from "@/lib/affiliates/program";
import { parseReferralCode } from "@/lib/affiliates/rules";
import { AFFILIATE_REF_PARAM } from "@/lib/affiliates/terms";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { getClientIp } from "@/lib/request-guards";

export const dynamic = "force-dynamic";

// Repeated visits to one link from one IP stop counting after this, like
// scans (lib/scans.ts); the link still goes on with the code.
const clickCountLimiter = createRateLimiter({
  limiter: slidingWindow(20, "60 s"),
});

async function withinCountLimit(code: string, request: Request) {
  try {
    const { success } = await clickCountLimiter.limit(
      `affiliate:click:${code}:${getClientIp(request)}`,
    );
    return success;
  } catch {
    return true;
  }
}

// The shadcn registry (public/r/*.json) shares /r with referral links. Its
// items are static files, so a .json name that gets here isn't one; a
// referral code has no dot, so this never hides one.
const REGISTRY_ITEM = /\.json$/i;
// shadcn's tools look for a registry's index at /r/registry.json or
// /r/registry. "registry" is reserved as a referral code (lib/affiliates/rules.ts).
const REGISTRY_INDEX = "registry";

const registryHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=0, must-revalidate",
  "X-Robots-Tag": "noindex",
};

function registryItemNotFound(file: string) {
  const name = file.slice(0, -".json".length);
  return Response.json(
    {
      error: "Not found",
      message: `No registry item named ${name}. The QRdx registry index is ${SHADCN_REGISTRY_URL}/${REGISTRY_INDEX}.json`,
    },
    {
      status: 404,
      headers: {
        ...registryHeaders,
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
}

type Context = { params: Promise<{ code: string }> };

/**
 * An affiliate's referral link: /r/<code> → /?ref=<code>, where the code
 * rides along to a sign-up in the same visit (components/referral-capture.tsx).
 * A link with the affiliate's earlier random code goes on with their current
 * one. It sets no cookie and stores nothing about the visitor; an approved affiliate's
 * visit count goes up by one (not for bots, link previews or more than 20 a
 * minute from one IP). Unknown,
 * pending, rejected or suspended codes, and a server where the program is
 * off, go to the home page without a code.
 *
 * It also answers the shadcn registry's misses, without touching the
 * referral program: /r/<name>.json for an item that doesn't exist is a 404
 * in JSON (not a redirect to the home page), and /r/registry goes on to
 * /r/registry.json.
 */
export async function GET(request: Request, { params }: Context) {
  const { code: raw } = await params;
  if (REGISTRY_ITEM.test(raw)) return registryItemNotFound(raw);
  const code = parseReferralCode(raw);
  if (code === REGISTRY_INDEX) {
    return new Response(null, {
      status: 308,
      headers: {
        ...registryHeaders,
        Location: `/r/${REGISTRY_INDEX}.json`,
      },
    });
  }
  let current: string | null = null;
  if (code && isFeatureAvailable("affiliates")) {
    const userAgent = request.headers.get("user-agent") ?? "";
    const prefetch =
      request.headers.get("purpose") === "prefetch" ||
      request.headers.get("sec-purpose")?.includes("prefetch") === true;
    const count =
      Boolean(userAgent) &&
      !isbot(userAgent) &&
      !prefetch &&
      (await withinCountLimit(code, request));
    current = await recordReferralClick(code, { count });
  }
  const location = current
    ? `/?${AFFILIATE_REF_PARAM}=${encodeURIComponent(current)}`
    : "/";
  return new Response(null, {
    status: 307,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
