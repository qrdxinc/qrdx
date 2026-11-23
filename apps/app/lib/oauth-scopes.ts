// OAuth scopes QRdx grants to apps. Client-safe: the consent screen and the
// developer settings import this; lib/oauth.ts re-exports it for the server.

export const OAUTH_SCOPES = [
  "themes:read",
  "profile:read",
  "codes:read",
  "codes:write",
] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

export const OAUTH_SCOPE_INFO: Record<
  OAuthScope,
  { label: string; consent: string }
> = {
  "profile:read": {
    label: "Profile",
    consent: "Read your profile (name, email and avatar)",
  },
  "themes:read": {
    label: "Themes",
    consent: "Read your saved QR themes",
  },
  "codes:read": {
    label: "Read codes",
    consent: "Read your dynamic QR codes and their scan analytics",
  },
  "codes:write": {
    label: "Manage codes",
    consent:
      "Create, edit and delete your dynamic QR codes, report conversions and manage webhook subscriptions",
  },
};

/**
 * What an app that registered itself through the MCP server can do with each
 * scope it may get: only the MCP server's dynamic-code tools, since its
 * token works nowhere else (no deleting codes, webhooks, conversions or AI
 * art). The consent screen shows these for such apps.
 */
export const MCP_SCOPE_INFO: Partial<
  Record<OAuthScope, { label: string; consent: string }>
> = {
  "codes:read": {
    label: "See codes",
    consent:
      "See your dynamic QR codes, where they go and how often they're scanned",
  },
  "codes:write": {
    label: "Make and change codes",
    consent:
      "Create dynamic QR codes in your workspace and change where your codes go",
  },
};

export function isOAuthScope(value: string): value is OAuthScope {
  return (OAUTH_SCOPES as readonly string[]).includes(value);
}
