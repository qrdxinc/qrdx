// Where the docs' AI chat plugs in. The Ask AI lane owns components/chat/**
// and replaces this file: everything else in the docs only imports these
// two names, so the chat can land without touching the layout or the
// search dialog.
//
// - <DocsChatSlot /> is mounted once in the docs layout
//   (app/[lang]/docs/layout.tsx), after the page, inside every provider
//   the docs have (theme, i18n, fumadocs' search and tree contexts). The
//   launcher button and the chat panel go here.
// - <DocsChatSearchEntry /> is rendered at the top of the search dialog's
//   results (components/search.tsx) with the current query, for an
//   "Ask AI about …" row; `close` closes the search dialog first.
//
// Both render nothing until the chat exists.

export function DocsChatSlot() {
  return null;
}

export function DocsChatSearchEntry(_props: {
  /** What the reader typed in the search box, trimmed. */
  query: string;
  /** Closes the search dialog (call it before opening the chat). */
  close: () => void;
}) {
  return null;
}
