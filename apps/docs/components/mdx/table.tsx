import { cn } from "@repo/design-system/lib/utils";
import type { ComponentProps } from "react";

/**
 * Every Markdown table sits in its own bordered box that scrolls sideways
 * when the table is wider than the page (a six-column roles table on a
 * phone), so the page itself never scrolls and the cut edge is visible.
 * A labelled, focusable section (WCAG 2.1.1: a scrollable region must be
 * reachable with the keyboard), as fumadocs' code viewports are.
 */
export function DocsTable({ className, ...props }: ComponentProps<"table">) {
  return (
    <section
      aria-label="Table"
      className="my-6 overflow-x-auto rounded-[0.625rem] border [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-inset"
      data-docs-table=""
      // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users scroll it.
      tabIndex={0}
    >
      <table {...props} className={cn("min-w-full", className)} />
    </section>
  );
}
