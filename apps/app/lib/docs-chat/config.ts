// The docs assistant's fixed limits (app/api/docs-chat, lib/docs-chat).
// Pure constants, so the route, the MCP docs tools, the tests and
// scripts/ai/docs-chat-eval.ts read the same numbers. The one deployment
// setting is DOCS_CHAT_DAILY_LIMIT (env.ts), the cap on answers per day
// across every visitor; DEFAULT_DAILY_LIMIT applies without it.

export const DOCS_CHAT = {
  /** Messages the client sends: the last ones of the conversation. */
  maxMessages: 10,
  /** Characters per question. */
  maxUserChars: 1000,
  /** Characters per earlier answer sent back as context. */
  maxAssistantChars: 4000,
  /** Characters of the page's title and path the client sends as context. */
  maxPageTitleChars: 200,
  maxPathChars: 300,
  /** Output tokens per model step: the answer stays short. */
  maxOutputTokens: 700,
  /** Model steps per answer: a search, up to three page reads, the reply. */
  maxSteps: 5,
  /** Pages a search returns to the model. */
  searchLimit: 8,
  /** Characters of a search snippet. */
  snippetChars: 200,
  /** Pages the model may read for one answer. */
  maxPagesPerAnswer: 3,
  /** Characters of one page the model sees; longer pages are cut with a note. */
  maxPageChars: 12_000,
  /** Characters of a search query. */
  maxQueryChars: 200,
  /** Per visitor (by IP): questions per minute and per UTC day. */
  perIpPerMinute: 6,
  perIpPerDay: 40,
  /** Across every visitor, per UTC day, without DOCS_CHAT_DAILY_LIMIT. */
  defaultDailyLimit: 2000,
  /** Fetched docs pages and searches stay this long in memory. */
  cacheTtlMs: 10 * 60_000,
  cacheMaxEntries: 300,
  /** One call to the docs site. */
  fetchTimeoutMs: 8000,
  /**
   * A search when the docs site may be cold. Its first search after a
   * deploy or an idle spell builds the index and has taken over 10 seconds,
   * so that one waits longer. Only one long wait per coldSearchRetryMs: with
   * the site down, an answer's calls still end well inside the route's 60
   * seconds (20 + 3 × 8).
   */
  coldSearchTimeoutMs: 20_000,
  coldSearchRetryMs: 60_000,
  /** The request body (a few short messages). */
  maxBodyBytes: 64 * 1024,
} as const;

/** What the UI shows when the daily cap, or a visitor's own cap, is reached. */
export const DOCS_CHAT_LIMIT_MESSAGE =
  "The docs assistant has reached today's limit. Search still works.";

/** What the UI shows when the visitor asks faster than the per-minute cap. */
export const DOCS_CHAT_PACE_MESSAGE =
  "You're asking quickly. Wait a moment and try again.";

/** What the UI shows when the assistant is off or not set up here. */
export const DOCS_CHAT_OFF_MESSAGE =
  "The docs assistant isn't available here. Search still works.";
