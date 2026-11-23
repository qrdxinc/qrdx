import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { HttpError } from "@/lib/error-response";
import { logError } from "@/lib/log-error";
import { NO_STORE_HEADERS, oauthError } from "@/lib/oauth";
import {
  checkRegistration,
  MAX_REGISTRATION_BYTES,
  rateLimitAddress,
  registerClient,
} from "@/lib/oauth-registration";
import {
  enforceRateLimits,
  getClientIp,
  readJsonBody,
} from "@/lib/request-guards";

// POST: dynamic client registration (RFC 7591) for MCP clients, the
// registration_endpoint of /.well-known/oauth-authorization-server. Open to
// anyone, like the spec wants, so it's narrow (lib/oauth-registration.ts)
// and limited. In order:
// 1. per address (an IPv6 /64 counts as one): ChatGPT and Claude register
//    from their own servers, so these leave room for many people at once;
// 2. the request is checked; a refused one stops here;
// 3. a budget across every address, which only registrations that would be
//    stored use up, so junk requests can't spend it for everyone else.
// Clients that never get used are deleted after a day (the daily cron,
// pruneUnusedDynamicClients).

const minuteLimiter = createRateLimiter({
  limiter: slidingWindow(20, "60 s"),
});
const hourLimiter = createRateLimiter({ limiter: slidingWindow(200, "1 h") });
const globalLimiter = createRateLimiter({
  limiter: slidingWindow(2000, "1 h"),
});

/** Browser-based MCP clients register from their own origin; no cookies are read. */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function withHeaders(response: Response, headers: Record<string, string>) {
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

/** The 429, or null when the limits let the request through. */
async function overLimit(
  checks: Parameters<typeof enforceRateLimits>[0],
): Promise<Response | null> {
  try {
    await enforceRateLimits(checks);
    return null;
  } catch (error) {
    if (error instanceof HttpError && error.status === 429) {
      return withHeaders(
        oauthError(
          "temporarily_unavailable",
          "Too many registrations. Try again later.",
          429,
        ),
        error.headers ?? {},
      );
    }
    throw error;
  }
}

export async function POST(req: Request) {
  const answer = (response: Response) =>
    withHeaders(response, { ...CORS_HEADERS, ...NO_STORE_HEADERS });
  const address = rateLimitAddress(getClientIp(req));
  const perAddress = await overLimit([
    { limiter: minuteLimiter, key: `oauth-register:ip:${address}` },
    { limiter: hourLimiter, key: `oauth-register:hour:ip:${address}` },
  ]);
  if (perAddress) return answer(perAddress);

  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    return answer(
      oauthError(
        "invalid_client_metadata",
        "Send the client metadata as JSON (Content-Type: application/json).",
      ),
    );
  }
  let body: unknown;
  try {
    body = await readJsonBody(req, MAX_REGISTRATION_BYTES);
  } catch {
    return answer(
      oauthError(
        "invalid_client_metadata",
        `The body must be a JSON object of at most ${MAX_REGISTRATION_BYTES / 1024} KB.`,
      ),
    );
  }

  const checked = checkRegistration(body);
  if (!checked.ok) {
    return answer(oauthError(checked.error, checked.description));
  }
  const overall = await overLimit([
    { limiter: globalLimiter, key: "oauth-register:hour:all" },
  ]);
  if (overall) return answer(overall);
  try {
    const client = await registerClient(checked);
    // How it authenticates; no names, URIs or ids.
    console.info(
      JSON.stringify({
        event: "oauth.client_registered",
        method: client.token_endpoint_auth_method,
      }),
    );
    return answer(Response.json(client, { status: 201 }));
  } catch (error) {
    logError(error as Error, { action: "oauth.register" });
    return answer(
      oauthError("server_error", "The client couldn't be registered.", 500),
    );
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
