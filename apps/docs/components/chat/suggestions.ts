// The chat's empty state offers questions that fit the docs tab the reader
// is on. The copy is in apps/app/messages/en.json under
// docs.chat.suggestions.<section>.<key>; every question is answerable from
// the docs (scripts/ai/docs-chat-eval.ts in the main app asks them all).
import type { DocsSection } from "./section";

export const SUGGESTION_KEYS = ["q1", "q2", "q3", "q4"] as const;

export type SuggestionKey = (typeof SUGGESTION_KEYS)[number];

export const SUGGESTION_SECTIONS: readonly DocsSection[] = [
  "home",
  "help",
  "guides",
  "developers",
  "react",
  "selfHosting",
];
