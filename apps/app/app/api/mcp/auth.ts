import "server-only";

// Sign-in for the MCP server's code tools (./codes.ts). The server stays
// public and stateless: every other tool works with no credential, and only
// a call to a sign-in tool needs one. Two kinds are accepted, both as
// `Authorization: Bearer …`, and checked as the REST API checks them
// (app/api/v1/codes/_lib/api.ts): an OAuth access token from QRdx's own
// provider (app/api/oauth, the issuer in /.well-known/oauth-authorization-
// server), or an API key (`qrdx_…`).
//
// When a sign-in tool is called without a usable token, the client has to
// be told in the way it acts on, and the two big ones differ:
// - Claude, Claude Code, Cursor, VS Code and the MCP spec: the HTTP request
//   itself fails, 401 (or 403 for a missing scope) with
//   `WWW-Authenticate: Bearer resource_metadata="…"`. That has to happen
//   before the MCP SDK runs (signInGate, called by route.ts): a tool's own
//   answer always goes out as a 200.
// - ChatGPT (OpenAI's Apps SDK): a normal tool result with isError and the
//   same challenge in `_meta["mcp/www_authenticate"]`, plus each tool's
//   `securitySchemes`. ChatGPT is recognised by the `openai/…` keys it puts
//   in every tools/call's `_meta`; that only picks the form of the answer,
//   never what anyone may do.
import { API_KEY_PREFIX } from "@/lib/api-keys/shared";
import { baseUrl } from "@/lib/metadata";
import { validateAccessToken } from "@/lib/oauth";
import {
  MCP_SCOPES,
  mcpResourceFor,
  resourceMetadataUrl,
} from "@/lib/oauth-metadata";

/** The tools that act on the signed-in person's workspace. */
export const SIGN_IN_MCP_TOOLS = [
  "create_dynamic_code",
  "list_codes",
  "get_code_stats",
  "update_code_destination",
] as const;
export type SignInMcpTool = (typeof SIGN_IN_MCP_TOOLS)[number];

const isSignInTool = (name: unknown): name is SignInMcpTool =>
  typeof name === "string" &&
  (SIGN_IN_MCP_TOOLS as readonly string[]).includes(name);

/**
 * What one sign-in asks for: both scopes, whichever tool asked first, so
 * the person consents once. codes:write covers reading (as on the REST API).
 */
export const SIGN_IN_SCOPE = MCP_SCOPES.join(" ");

/** The `securitySchemes` each sign-in tool declares (OpenAI Apps SDK). */
export const SIGN_IN_SECURITY_SCHEMES = [
  { type: "oauth2", scopes: [...MCP_SCOPES] },
];

/** The `securitySchemes` of every other tool: callable with no account. */
export const NO_AUTH_SECURITY_SCHEMES = [{ type: "noauth" }];

/** The Authorization header carries a `qrdx_…` API key (by its shape alone). */
export function sendsApiKey(req: Request): boolean {
  const token = bearerToken(req);
  return Boolean(token?.startsWith(API_KEY_PREFIX));
}

/** The Bearer token, the scheme matched in any case (RFC 7235 §2.1). */
function bearerToken(req: Request): string | null {
  const match = /^bearer\s+(.+)$/i.exec(
    req.headers.get("authorization")?.trim() ?? "",
  );
  return match?.[1]?.trim() || null;
}

type AuthError = "invalid_token" | "insufficient_scope";

/**
 * RFC 6750 §3: the challenge, with where to find the authorization server.
 * With no `error` (the request sent no credentials, §3.1), no error fields.
 */
export function bearerChallenge(
  requestUrl: string,
  error: AuthError | null,
  description: string,
): string {
  const metadata = resourceMetadataUrl(mcpResourceFor(requestUrl));
  const base = `Bearer resource_metadata="${metadata}", scope="${SIGN_IN_SCOPE}"`;
  if (!error) return base;
  // Quoted-string values: no quotes or backslashes inside.
  const safe = description.replace(/["\\]/g, "'");
  return `${base}, error="${error}", error_description="${safe}"`;
}

const SIGN_IN_NEEDED =
  "Sign in to QRdx to make and manage dynamic QR codes in your workspace";
const TOKEN_REFUSED =
  "The QRdx sign-in has expired or was revoked. Sign in again";
const SCOPE_MISSING =
  "This QRdx sign-in can't manage codes. Sign in again and allow it";

type JsonRpcMessage = {
  method?: unknown;
  params?: { name?: unknown; _meta?: unknown };
};

const asMessages = (body: unknown): JsonRpcMessage[] =>
  (Array.isArray(body) ? body : [body]).filter(
    (item): item is JsonRpcMessage => typeof item === "object" && item !== null,
  );

/** The sign-in tool calls in a request body (one message or a batch). */
function signInCalls(body: unknown): JsonRpcMessage[] {
  return asMessages(body).filter(
    (message) =>
      message.method === "tools/call" && isSignInTool(message.params?.name),
  );
}

/**
 * Sent by an OpenAI host (ChatGPT, Codex): its tools/call requests carry
 * `openai/…` keys in `_meta` (openai/subject, openai/session, openai/locale).
 */
export function fromOpenAiHost(
  message: JsonRpcMessage,
  req?: Request,
): boolean {
  const meta = message.params?._meta;
  if (meta && typeof meta === "object") {
    if (Object.keys(meta).some((key) => key.startsWith("openai/"))) {
      return true;
    }
  }
  return /^openai-mcp\//i.test(req?.headers.get("user-agent") ?? "");
}

function challengeResponse(
  req: Request,
  status: 401 | 403,
  error: AuthError | null,
  description: string,
): Response {
  return Response.json(
    { error: error ?? "invalid_token", error_description: description },
    {
      status,
      headers: {
        "WWW-Authenticate": bearerChallenge(req.url, error, description),
        "Cache-Control": "no-store",
      },
    },
  );
}

/**
 * Before the MCP SDK runs: a request that calls a sign-in tool without a
 * token that can do it is refused at the HTTP level, so the client starts
 * its sign-in (401) or asks for more scope (403), then retries the call.
 * Null lets the request through: no sign-in tool in it, a usable token, an
 * API key (whose problems the tools report in words: signing in again can't
 * fix a key someone pasted), or a ChatGPT call, which the tool itself
 * answers with the challenge in `_meta`.
 */
export async function signInGate(
  req: Request,
  body: unknown,
): Promise<Response | null> {
  const calls = signInCalls(body);
  if (calls.length === 0) return null;
  if (calls.every((call) => fromOpenAiHost(call, req))) return null;
  if (sendsApiKey(req)) return null;
  const token = bearerToken(req);
  if (!token) {
    // No credentials: the challenge carries no error code (RFC 6750 §3.1).
    return challengeResponse(req, 401, null, SIGN_IN_NEEDED);
  }
  const grant = await validateAccessToken(token);
  if (!grant) {
    return challengeResponse(req, 401, "invalid_token", TOKEN_REFUSED);
  }
  if (!MCP_SCOPES.some((scope) => grant.scopes.includes(scope))) {
    return challengeResponse(req, 403, "insufficient_scope", SCOPE_MISSING);
  }
  // codes:read alone can list and read; the write tools need codes:write.
  const writes = calls.some(
    (call) =>
      call.params?.name === "create_dynamic_code" ||
      call.params?.name === "update_code_destination",
  );
  if (writes && !grant.scopes.includes("codes:write")) {
    return challengeResponse(req, 403, "insufficient_scope", SCOPE_MISSING);
  }
  return null;
}

/**
 * A tool's answer when the call has no usable sign-in: what to do, in words
 * for the model, and the challenge in `_meta` for ChatGPT, which shows its
 * Connect button for it. Other clients get the HTTP refusal from signInGate
 * before a tool runs; this reaches them only if a token stopped working in
 * between.
 */
export function signInRequiredResult(
  req: Request | null,
  reason: "missing" | "invalid" | "scope",
) {
  const [error, description] =
    reason === "scope"
      ? (["insufficient_scope", SCOPE_MISSING] as const)
      : reason === "invalid"
        ? (["invalid_token", TOKEN_REFUSED] as const)
        : // As OpenAI's own example: with no token, insufficient_scope.
          (["insufficient_scope", SIGN_IN_NEEDED] as const);
  const url = req?.url ?? baseUrl.toString();
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: `${description}. The app shows a button to sign in to QRdx (new accounts sign up there too); after signing in, try again.`,
      },
    ],
    _meta: {
      "mcp/www_authenticate": [bearerChallenge(url, error, description)],
    },
  };
}
