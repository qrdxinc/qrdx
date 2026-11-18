// Where the hosted service lives. The running app's own origin and its
// short-link origin depend on the environment: ./origins.ts.

/** The production domain. */
export const CANONICAL_HOST = "qrdx.dev";
/** The hosted service, for links and copy that must point at it whatever the environment. */
export const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;

/** The REST and image API (api.qrdx.dev/v1 → /api/v1, apps/app/next.config.ts). */
export const API_HOST = `api.${CANONICAL_HOST}`;
const API_ORIGIN = `https://${API_HOST}`;
/** The hosted REST API's base URL, without a trailing slash. */
export const API_BASE_URL = `${API_ORIGIN}/v1`;

/** The MCP server (mcp.qrdx.dev/mcp → /api/mcp, apps/app/next.config.ts). */
export const MCP_HOST = `mcp.${CANONICAL_HOST}`;
/** The hosted MCP server's public endpoint. */
export const MCP_ENDPOINT = `https://${MCP_HOST}/mcp`;

/** The shadcn registry's files: `<url>/qr-code.json`, `<url>/registry.json`. */
export const SHADCN_REGISTRY_URL = `${CANONICAL_ORIGIN}/r`;

/**
 * The registry's namespace in the shadcn/ui registry directory:
 * `npx shadcn@latest add @qrdx/qr-code`. The CLI (3.7.0 and later) resolves
 * it from the directory's index, so projects don't add it to components.json.
 */
export const SHADCN_REGISTRY_NAMESPACE = "@qrdx";

/** The shadcn/ui registry directory, which lists the namespace. */
export const SHADCN_DIRECTORY_URL = "https://ui.shadcn.com/docs/directory";

/** qrdx.dev or one of its subdomains (www, api, mcp). */
export function isQrdxHost(host: string): boolean {
  return host === CANONICAL_HOST || host.endsWith(`.${CANONICAL_HOST}`);
}

/** Where a dev server runs when NEXT_PUBLIC_APP_URL doesn't say. */
export const DEV_BASE_URL = "http://localhost:3000";

/**
 * The origin absolute URLs are built on (canonical and Open Graph URLs,
 * template and sample images, links in emails). In development, the dev
 * server's own NEXT_PUBLIC_APP_URL, so a server on another port links to
 * itself; otherwise the production domain Vercel names, then
 * NEXT_PUBLIC_APP_URL, then qrdx.dev.
 */
export function resolveBaseUrl({
  nodeEnv,
  devAppUrl,
  appUrl,
  productionUrl,
}: {
  nodeEnv: string | undefined;
  /** NEXT_PUBLIC_APP_URL, read only in development */
  devAppUrl: string | undefined;
  /** NEXT_PUBLIC_APP_URL as the process has it */
  appUrl: string | undefined;
  /** VERCEL_PROJECT_PRODUCTION_URL: a host name, no scheme */
  productionUrl: string | undefined;
}): URL {
  if (nodeEnv === "development") return new URL(devAppUrl || DEV_BASE_URL);
  return new URL(
    productionUrl ? `https://${productionUrl}` : (appUrl ?? CANONICAL_ORIGIN)
  );
}
