"use client";

import { cn } from "@repo/design-system/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavLinks } from "../_lib/nav";

/**
 * `consoleEnabled`: the back-office console is proxied here (CONSOLE_ORIGIN
 * is set). `adminConsoleUrl`: it's at its own address (ADMIN_CONSOLE_URL),
 * so its entries are absolute links there, never the active page here.
 */
export function AdminNav({
  consoleEnabled,
  adminConsoleUrl,
}: {
  consoleEnabled: boolean;
  adminConsoleUrl?: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="w-full min-w-0 shrink-0 md:w-56">
      <nav className="flex gap-1 overflow-x-auto md:flex-col">
        {adminNavLinks(consoleEnabled, adminConsoleUrl).map((item) => {
          const isActive =
            item.href === "/admin"
              ? pathname === item.href
              : item.href.startsWith("/") && pathname.startsWith(item.href);
          const className = cn(
            "hover:bg-muted flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
            isActive && "bg-muted",
          );
          const content = (
            <>
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </>
          );
          // Another zone's page: a full page load (next/link can't cross zones).
          return item.crossZone ? (
            <a className={className} href={item.href} key={item.href}>
              {content}
            </a>
          ) : (
            <Link className={className} href={item.href} key={item.href}>
              {content}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
