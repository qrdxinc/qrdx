// OAuth discovery for MCP clients (the MCP authorization spec):
//
// - Protected Resource Metadata (RFC 9728) for the MCP server, served by
//   app/.well-known/oauth-protected-resource/** on whichever host the client
//   connected to (mcp.qrdx.dev/mcp or <origin>/api/mcp);
// - Authorization Server Metadata (RFC 8414) for this app's OAuth provider
//   (app/api/oauth/*), served by app/.well-known/oauth-authorization-server.
//
// The issuer is this deployment's origin (qrdx.dev in production,
// localhost in development, a self-hosted domain there), so a client always
// signs in where the server it connected to is run. Pure apart from the
// origin: the routes and tests import it.
import { API_BASE_URL, MCP_ENDPOINT, MCP_HOST } from "@repo/config";
import { MCP_PATH } from "@/lib/mcp-clients";
import { baseUrl } from "@/lib/metadata";
import { PKCE_METHODS } from "@/lib/oauth";
import { OAUTH_SCOPES } from "@/lib/oauth-scopes";

/** The scopes the MCP server's sign-in tools use (app/api/mcp/codes.ts). */
export const MCP_SCOPES = ["codes:read", "codes:write"] as const;

/** RFC 8414 issuer: this deployment's origin, without a trailing slash. */
export function oauthIssuer(origin: URL = baseUrl): string {
  return origin.origin;
}

const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";

/**
 * The MCP server's resource identifier (RFC 8707/9728) for a request: the
 * URL the client connected to, which is what Claude and ChatGPT send back
 * as `resource`. https://mcp.qrdx.dev/mcp on the MCP host, else
 * <origin>/api/mcp (qrdx.dev, local development, a self-hosted domain).
 */
export function mcpResourceFor(requestUrl: string | URL): string {
  const url = new URL(requestUrl);
  if (url.hostname === MCP_HOST) return MCP_ENDPOINT;
  return new URL(MCP_PATH, url.origin).toString();
}

/**
 * Where a resource's metadata lives (RFC 9728 §3.1): the well-known path
 * with the resource's path after it, on the resource's own origin.
 */
export function resourceMetadataUrl(resource: string): string {
  const url = new URL(resource);
  const path = url.pathname === "/" ? "" : url.pathname;
  return `${url.origin}${RESOURCE_METADATA_PATH}${path}`;
}

/** RFC 9728 Protected Resource Metadata for the MCP server at `resource`. */
export function protectedResourceMetadata(resource: string) {
  return {
    resource,
    authorization_servers: [oauthIssuer()],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "QRdx",
    resource_documentation: new URL("/docs/developers/mcp", baseUrl).toString(),
  };
}

/** The token endpoint authentication methods the provider accepts. */
export const TOKEN_ENDPOINT_AUTH_METHODS = [
  "client_secret_basic",
  "client_secret_post",
  "none",
] as const;
export type TokenEndpointAuthMethod =
  (typeof TOKEN_ENDPOINT_AUTH_METHODS)[number];

/**
 * RFC 8414 Authorization Server Metadata. No client ID metadata documents
 * (clients register at registration_endpoint), and `iss` comes back on every
 * authorization response (RFC 9207).
 */
export function authorizationServerMetadata() {
  const issuer = oauthIssuer();
  const endpoint = (path: string) => `${issuer}${path}`;
  return {
    issuer,
    authorization_endpoint: endpoint("/api/oauth/authorize"),
    token_endpoint: endpoint("/api/oauth/token"),
    registration_endpoint: endpoint("/api/oauth/register"),
    revocation_endpoint: endpoint("/api/oauth/revoke"),
    scopes_supported: [...OAUTH_SCOPES],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: [...TOKEN_ENDPOINT_AUTH_METHODS],
    revocation_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: [...PKCE_METHODS],
    authorization_response_iss_parameter_supported: true,
    service_documentation: new URL(
      "/docs/developers/rest-api",
      baseUrl,
    ).toString(),
  };
}

/** A resource value as compared: no fragment, no trailing slash. */
function normalizedResource(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.hash || url.username || url.password) return null;
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.origin}${path}${url.search}`;
  } catch {
    return null;
  }
}

/**
 * RFC 8707: the `resource` a client asks a token for must be this
 * deployment's own: its MCP server (on the MCP host, or at /api/mcp) or its
 * REST API. Anything else is refused with invalid_target, so no token is
 * ever issued "for" another server.
 */
export function isOwnResource(value: string): boolean {
  const normalized = normalizedResource(value);
  if (!normalized) return false;
  const own = [
    MCP_ENDPOINT,
    `https://${MCP_HOST}`,
    new URL(MCP_PATH, baseUrl).toString(),
    API_BASE_URL,
    new URL("/api/v1", baseUrl).toString(),
    baseUrl.origin,
  ].map((item) => normalizedResource(item));
  return own.includes(normalized);
}
