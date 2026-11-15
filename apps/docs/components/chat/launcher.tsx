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

// The Ask AI entry points, where fumadocs puts its search: a quiet button
// beside the search box in the header on wide screens (the Dashboard button
// stays the only filled one) and an icon beside the search icon in the
// phone header. Both go through the layout's searchTrigger slot
// (components/chat/layout.tsx), which keeps fumadocs' own triggers.

/** "⌘I" on Mac, "Ctrl I" elsewhere, decided in the browser. */
function useShortcutLabel(): string {
  const [label, setLabel] = useState("⌘I");
  useEffect(() => {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    setLabel(mac ? "⌘I" : "Ctrl I");
  }, []);
  return label;
}

/** The header button, next to the search box. */
export function AskAiHeaderButton({
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
      title={`${t("open")} (${shortcut})`}
      type="button"
      {...props}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border bg-fd-secondary/50 px-3 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring data-[state=open]:bg-fd-accent data-[state=open]:text-fd-accent-foreground",
        className,
      )}
      data-state={open ? "open" : "closed"}
      onClick={() => setOpen(!open)}
    >
      <Bot className="size-4 text-fd-primary" size={16} />
      {t("open")}
    </button>
  );
}

/** The phone header icon, beside the search icon. */
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

/**
 * fumadocs' header search box with the Ask AI button beside it. The header
 * hands the box its width classes; they go on the pair, and the box keeps
 * its own look.
 */
export function SearchAndAskFull({
  className,
  ...props
}: FullSearchTriggerProps) {
  return (
    <div className={cn("flex items-center gap-2", className, "ps-0")}>
      <FullSearchTrigger
        {...props}
        className="min-w-0 flex-1 rounded-xl ps-2.5"
      />
      <AskAiHeaderButton />
    </div>
  );
}

/** fumadocs' phone header search icon with the Ask AI icon beside it. */
export function SearchAndAskSmall(props: SearchTriggerProps) {
  return (
    <>
      <SearchTrigger {...props} />
      <AskAiIconTrigger className="p-2" />
    </>
  );
}
