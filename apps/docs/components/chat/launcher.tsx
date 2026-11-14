"use client";

import { Bot } from "@repo/design-system/components/icons";
import { cn } from "@repo/design-system/lib/utils";
import { buttonVariants } from "fumadocs-ui/components/ui/button";
import {
  FullSearchTrigger,
  type FullSearchTriggerProps,
  SearchTrigger,
  type SearchTriggerProps,
} from "fumadocs-ui/layouts/shared/slots/search-trigger";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useDocsChat } from "./provider";

// The Ask AI entry points, where fumadocs puts its search: the wide row at
// the top of the sidebar (search above, Ask AI below, same style) and the
// icon in the mobile header. Both go through the layout's searchTrigger
// slot (components/chat/layout.tsx), which keeps fumadocs' own triggers.

/** "⌘I" on Mac, "Ctrl I" elsewhere, decided in the browser. */
function useShortcutLabel(): string {
  const [label, setLabel] = useState("⌘I");
  useEffect(() => {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    setLabel(mac ? "⌘I" : "Ctrl I");
  }, []);
  return label;
}

/** The sidebar row, under the search box. */
export function AskAiFullTrigger({
  className,
  ...props
}: React.ComponentProps<"button">) {
  const { enabled, open, setOpen } = useDocsChat();
  const t = useTranslations("docs.chat");
  const shortcut = useShortcutLabel();
  if (!enabled) return null;
  return (
    <button
      aria-expanded={open}
      aria-label={t("openLabel")}
      data-ask-ai=""
      type="button"
      {...props}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border bg-fd-secondary/50 p-1.5 ps-2 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground",
        className,
      )}
      onClick={() => setOpen(!open)}
    >
      <Bot className="size-4 text-fd-primary" size={16} />
      {t("open")}
      <kbd className="ms-auto rounded-md border bg-fd-background px-1.5">
        {shortcut}
      </kbd>
    </button>
  );
}

/** The header icon, beside the search icon on small screens. */
export function AskAiIconTrigger({
  className,
  ...props
}: React.ComponentProps<"button">) {
  const { enabled, open, setOpen } = useDocsChat();
  const t = useTranslations("docs.chat");
  if (!enabled) return null;
  return (
    <button
      aria-expanded={open}
      aria-label={t("openLabel")}
      data-ask-ai=""
      type="button"
      {...props}
      className={cn(
        buttonVariants({ size: "icon-sm", variant: "ghost" }),
        className,
      )}
      onClick={() => setOpen(!open)}
    >
      <Bot className="size-4" size={16} />
    </button>
  );
}

/** fumadocs' sidebar search box with the Ask AI row under it. */
export function SearchAndAskFull(props: FullSearchTriggerProps) {
  return (
    <>
      <FullSearchTrigger {...props} />
      <AskAiFullTrigger />
    </>
  );
}

/** fumadocs' header search icon with the Ask AI icon beside it. */
export function SearchAndAskSmall(props: SearchTriggerProps) {
  return (
    <>
      <SearchTrigger {...props} />
      <AskAiIconTrigger className="p-2" />
    </>
  );
}
