"use client";

import { cn } from "@repo/design-system/lib/utils";
import type { ComponentProps } from "react";
import { DocsLocaleMenu } from "@/components/docs/docs-locale-menu";

/**
 * The docs sidebar's footer: the language menu, in one bar with whatever
 * fumadocs' notebook layout puts there (`children`: the GitHub link below
 * `lg`, and in the mobile menu the theme switch too). Passed as a component
 * so the bar shows on every width; the class fumadocs hands over hides its
 * own footer on wide screens and is dropped.
 */
export function DocsSidebarFooter({
  children,
  className: _className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn(
        "flex items-center gap-1 border-t px-3 py-2.5 text-fd-muted-foreground",
      )}
    >
      <DocsLocaleMenu />
      {children}
    </div>
  );
}
