"use client";

import { splitLocale } from "@repo/i18n/paths";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Pages that end without the closing band: after a purchase, legal text and
 * the abuse report form, where a sales line would be out of place. (The 404
 * renders outside the marketing layouts, so it never gets one.)
 */
const QUIET_PATHS = ["/success", "/legal", "/report-abuse"];

export const isQuietPath = (path: string) =>
  QUIET_PATHS.some((quiet) => path === quiet || path.startsWith(`${quiet}/`));

/** Renders the band except on the quiet pages (a layout can't see the path). */
export function CtaGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  return isQuietPath(splitLocale(pathname).path) ? null : children;
}
