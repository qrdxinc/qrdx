"use client";

import { DocsLayout, type DocsLayoutProps } from "fumadocs-ui/layouts/notebook";
import { lazy, Suspense } from "react";
import { SearchAndAskFull, SearchAndAskSmall } from "./launcher";
import { DocsChatProvider, useDocsChat } from "./provider";

// fumadocs' notebook DocsLayout with the docs assistant mounted: its
// `aiChat` option docks the panel beside the page on wide screens and
// floats it over the page on small ones (styles.css makes it a full sheet
// on phones), and the layout's searchTrigger slot gets the Ask AI button
// next to the header search (and its icon in the phone header). The layout
// needs client state (open or closed), so app/docs/layout.tsx
// imports this in place of fumadocs' DocsLayout, with the same props. The
// provider that holds that state lives here too; the search dialog hands
// questions over through a window event (./provider askDocsChat), so
// nothing above this needs to know about the chat. Where the main app
// doesn't offer the assistant (./enabled) this renders fumadocs' layout as
// it is.

// The panel's code (the AI SDK, Markdown rendering) loads when it first opens.
const DocsChatPanel = lazy(() =>
  import("./panel").then((module) => ({ default: module.DocsChatPanel })),
);

export type DocsChatLayoutProps = Omit<DocsLayoutProps, "aiChat">;

function LayoutWithChat(props: DocsChatLayoutProps) {
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

export function DocsChatLayout(props: DocsChatLayoutProps) {
  return (
    <DocsChatProvider>
      <LayoutWithChat {...props} />
    </DocsChatProvider>
  );
}
