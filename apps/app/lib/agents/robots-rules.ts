// robots.txt groups (app/robots.ts). Every crawler named here is welcome on
// public pages; the app, API and machine paths stay out.

/** Search engines, named so their group is explicit. */
export const SEARCH_CRAWLERS = [
  "Googlebot",
  "Bingbot",
  "Applebot",
  "DuckDuckBot",
] as const;

/**
 * AI crawlers, search indexes and assistants fetching a page for a user,
 * all welcome on public pages. Training opt-outs that are only robots tokens
 * (Google-Extended, Applebot-Extended) are listed as allowed too.
 */
export const AI_CRAWLERS = [
  // OpenAI
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  // Anthropic
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  // Perplexity
  "PerplexityBot",
  "Perplexity-User",
  // Google and Apple AI use
  "Google-Extended",
  "Applebot-Extended",
  // Others
  "CCBot",
  "meta-externalagent",
  "Amazonbot",
  "DuckAssistBot",
  "MistralAI-User",
  "cohere-ai",
] as const;

/**
 * Assistants fetching a URL because a person asked them to (an image API
 * URL from llms.txt, say), not crawling. The only agents the API and MCP
 * hosts let in (machineHostRobots).
 */
export const ASSISTANT_FETCHERS = [
  "ChatGPT-User",
  "Claude-User",
  "Perplexity-User",
  "MistralAI-User",
] as const satisfies readonly (typeof AI_CRAWLERS)[number][];

/**
 * robots.txt on api.qrdx.dev and mcp.qrdx.dev (app/api/machine-robots,
 * rewritten there in next.config.ts). Those hosts answer programs: search
 * engines and crawlers stay out, as API hosts usually ask. Assistants
 * fetching a URL for a person may still. Every response there also carries
 * X-Robots-Tag: noindex.
 */
export function machineHostRobots(): string {
  return [
    "# API and MCP endpoints: nothing here to crawl or index.",
    "User-agent: *",
    "Disallow: /",
    "",
    "# Assistants fetching a URL a person asked for.",
    ...ASSISTANT_FETCHERS.map((agent) => `User-agent: ${agent}`),
    "Allow: /",
    "",
  ].join("\n");
}

/**
 * Signed-in app, API and machine paths: nothing to index. Hosted pages (/p)
 * aren't listed: they carry their own noindex, which crawlers have to fetch
 * the page to see. Crawlers obey only their most specific group, so every
 * group repeats this list.
 */
export const DISALLOW = [
  "/api/",
  "/admin",
  "/settings",
  "/oauth",
  "/dashboard",
  "/invite",
  "/q/",
  "/m/",
  // Affiliate referral links: redirects to the home page that count visits.
  "/r/",
];
