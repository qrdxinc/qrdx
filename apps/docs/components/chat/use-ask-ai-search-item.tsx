"use client";

import { Bot } from "@repo/design-system/components/icons";
import type { SearchItemType } from "fumadocs-ui/components/dialog/search";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useDocsChat } from "./provider";

/**
 * The "Ask AI about …" row at the top of the search dialog
 * (components/search.tsx): picking it hands the typed query to the chat and
 * the dialog closes. Nothing when the chat is off or the query is too short.
 */
export function useAskAiSearchItem(search: string): SearchItemType | undefined {
  const { enabled, ask } = useDocsChat();
  const t = useTranslations("docs.chat");
  const query = search.trim();
  return useMemo<SearchItemType | undefined>(() => {
    if (!enabled || query.length < 3) return undefined;
    return {
      id: "ask-ai",
      type: "action",
      node: (
        <div className="inline-flex items-center gap-2 text-fd-muted-foreground">
          <Bot className="size-4 shrink-0 text-fd-primary" size={16} />
          <p className="truncate">{t("askAbout", { query })}</p>
        </div>
      ),
      onSelect: () => ask(query, "search"),
    };
  }, [enabled, query, ask, t]);
}
