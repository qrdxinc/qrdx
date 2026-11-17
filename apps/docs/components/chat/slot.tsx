"use client";

import { Bot } from "@repo/design-system/components/icons";
import { useTranslations } from "next-intl";
import { DOCS_CHAT_ENABLED } from "./enabled";
import { askDocsChat } from "./provider";

// Where the docs' AI chat plugs into the Shell lane's files. The rest of
// the docs only import these two names (app/[lang]/docs/layout.tsx and
// components/search.tsx), so the chat lands without touching them.
//
// The panel itself is not mounted here: it is docked beside the page by
// fumadocs' `aiChat` layout option, which components/chat/layout.tsx passes
// to the notebook DocsLayout the docs layout imports from there. The
// launcher sits in the header's search slot the same way (./launcher).

/** The chat's mount point after the page: nothing to add, the layout docks the panel. */
export function DocsChatSlot() {
  return null;
}

/**
 * The "Ask AI about …" row at the top of the search dialog's results:
 * picking it closes the dialog and hands the typed query to the chat.
 * Nothing when the chat is off here or the query is too short.
 */
export function DocsChatSearchEntry({
  query,
  close,
}: {
  /** What the reader typed in the search box, trimmed. */
  query: string;
  /** Closes the search dialog (call it before opening the chat). */
  close: () => void;
}) {
  const t = useTranslations("docs.chat");
  if (!DOCS_CHAT_ENABLED || query.length < 3) return null;
  return (
    <div className="px-2 pt-2">
      <button
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:bg-fd-accent focus-visible:outline-none"
        data-ask-ai-search=""
        onClick={() => {
          close();
          askDocsChat(query, "search");
        }}
        type="button"
      >
        <Bot className="size-4 shrink-0 text-fd-primary" size={16} />
        <span className="truncate">{t("askAbout", { query })}</span>
      </button>
    </div>
  );
}
