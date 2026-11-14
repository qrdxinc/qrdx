"use client";

import { DocsLayout, type DocsLayoutProps } from "fumadocs-ui/layouts/docs";
import { lazy, Suspense } from "react";
import { SearchAndAskFull, SearchAndAskSmall } from "./launcher";
import { useDocsChat } from "./provider";

// fumadocs' DocsLayout with the docs assistant mounted: its `aiChat` option
// docks the panel beside the page on wide screens and floats it over the
// page on small ones, and its searchTrigger slot gets the Ask AI entry
// points next to the search. The layout needs client state (open or
// closed), so app/[lang]/docs/layout.tsx renders this instead of DocsLayout
// itself, with the same props, inside a DocsChatProvider (./provider) that
// also wraps the search dialog. With the chat off (availability "docsChat")
// this renders fumadocs' layout as it is.

// The panel's code (the AI SDK, Markdown rendering) loads when it first opens.
const DocsChatPanel = lazy(() =>
  import("./panel").then((module) => ({ default: module.DocsChatPanel })),
);

export type DocsChatLayoutProps = Omit<DocsLayoutProps, "aiChat">;

export function DocsChatLayout(props: DocsChatLayoutProps) {
  const { enabled, open, setOpen } = useDocsChat();
  if (!enabled) return <DocsLayout {...props} />;
  return (
    <DocsLayout
      {...props}
      aiChat={{
        open,
        onOpenChange: setOpen,
        panel: (
          <Suspense fallback={null}>
            <DocsChatPanel />
          </Suspense>
        ),
      }}
      slots={{
        ...props.slots,
        searchTrigger: { sm: SearchAndAskSmall, full: SearchAndAskFull },
      }}
    />
  );
}
