// The docs assistant's wiring to this deployment: where the docs site is,
// whether the switch is on, and the one retriever the chat route and the
// MCP docs tools share (its cache lives for the process).
import "server-only";

import { isDocsChatSwitchedOn } from "@repo/availability";
import { CANONICAL_ORIGIN } from "@repo/config";
import { env } from "@/env";
import { isPathAvailable } from "@/lib/feature-availability";
import { baseUrl } from "@/lib/metadata";
import { createDocsRetriever, type DocsRetriever } from "./retrieval";

/** DOCS_CHAT_ENABLED isn't "0" or "false" (unset means on). */
export function docsChatSwitchedOn(): boolean {
  return isDocsChatSwitchedOn(env.DOCS_CHAT_ENABLED);
}

/**
 * Where the docs are read from: the docs site this deployment proxies
 * (DOCS_ZONE_URL), else qrdx.dev, where a deployment without a docs site
 * sends its readers anyway (@repo/i18n/docs docsOriginRedirects). The chat
 * itself needs DOCS_ZONE_URL (lib/docs-chat/guards.ts); the MCP docs tools
 * work either way.
 */
export function docsOrigin(): string {
  return (env.DOCS_ZONE_URL ?? CANONICAL_ORIGIN).replace(/\/+$/, "");
}

let retriever: DocsRetriever | undefined;

/** The retriever for this deployment, built on first use. */
export function docsRetriever(): DocsRetriever {
  retriever ??= createDocsRetriever({
    docsOrigin: docsOrigin(),
    // Links in answers and tool results point where readers see the docs:
    // this app's origin when it has a docs site, qrdx.dev otherwise.
    publicOrigin: env.DOCS_ZONE_URL ? baseUrl.origin : CANONICAL_ORIGIN,
    isPathAvailable,
  });
  return retriever;
}
