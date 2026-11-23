import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { HttpError } from "@/lib/error-response";
import { logError } from "@/lib/log-error";
import { NO_STORE_HEADERS, oauthError } from "@/lib/oauth";
import {
  checkRegistration,
  MAX_REGISTRATION_BYTES,
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
// and limited per IP address. ChatGPT and Claude register from their own
// servers, so the limits leave room for many people connecting at once.

const minuteLimiter = createRateLimiter({
  limiter: slidingWindow(20, "60 s"),
});
const hourLimiter = createRateLimiter({ limiter: slidingWindow(200, "1 h") });
// Across every address: far above what people connecting apps need, so
// many addresses at once can't fill the table either.
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

export async function POST(req: Request) {
  const answer = (response: Response) =>
    withHeaders(response, { ...CORS_HEADERS, ...NO_STORE_HEADERS });
  const ip = getClientIp(req);
  try {
    await enforceRateLimits([
      { limiter: minuteLimiter, key: `oauth-register:ip:${ip}` },
      { limiter: hourLimiter, key: `oauth-register:hour:ip:${ip}` },
      { limiter: globalLimiter, key: "oauth-register:hour:all" },
    ]);
  } catch (error) {
    if (error instanceof HttpError && error.status === 429) {
      return answer(
        withHeaders(
          oauthError(
            "temporarily_unavailable",
            "Too many registrations. Try again later.",
            429,
          ),
          error.headers ?? {},
        ),
      );
    }
    throw error;
  }

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
  try {
    const client = await registerClient(checked);
    // The client and how it authenticates; no names, URIs or ids.
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
