import "server-only";

import { mcpClientFamily } from "@/app/api/mcp/usage";
import { MCP_REF } from "@/lib/analytics/handoff-tags";
import type { SignUpLanding } from "@/lib/analytics/landing";

/**
 * What a sign-up on the consent page carries on top of the visit, when the
 * app asking is an MCP client that registered itself: ref=mcp, so the new
 * account counts as coming from the MCP server (lib/analytics/channel.ts),
 * and the client's family (chatgpt, claude, cursor, vscode, ...) as its
 * utm_source. Read from the name the client registered, a fixed list of
 * families, never the name itself. Undefined for any other app.
 */
export function mcpSignUpTags(app: {
  dynamic: boolean;
  name: string;
}): Pick<SignUpLanding, "ref" | "utm_source"> | undefined {
  if (!app.dynamic) return undefined;
  const family = mcpClientFamily(app.name);
  return {
    ref: MCP_REF,
    ...(family === "other" ? {} : { utm_source: family }),
  };
}
