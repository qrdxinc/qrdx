"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Button } from "@repo/design-system/components/ui/button";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Where a click on a link would take the editor's tab, or null when it
 * doesn't leave the page: another tab or window, a download, another site,
 * the same page (a "#" link), or a click with a modifier key or another
 * button (the browser opens those elsewhere).
 */
export function leavingHref(event: MouseEvent, here: URL): string | null {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return null;
  }
  const target = event.target;
  const anchor = target instanceof Element ? target.closest("a[href]") : null;
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;
  let url: URL;
  try {
    url = new URL(anchor.getAttribute("href") ?? "", here);
  } catch {
    return null;
  }
  if (url.origin !== here.origin) return null;
  if (url.pathname === here.pathname && url.search === here.search) {
    return null;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Asks before a link in the app leaves the page editor while it has
 * unpublished changes. The editor's beforeunload covers reloads and closing
 * the tab, but moving to another page of the app never fires it, so people
 * left with their upload unpublished and scans kept opening the old page.
 * The changes stay in this browser either way (the editor's draft), so
 * leaving only means they aren't live yet.
 */
export function LeaveGuard({ active }: { active: boolean }) {
  const router = useRouter();
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    // Capture, on the document: before Next's Link handles the click.
    const onClick = (event: MouseEvent) => {
      const next = leavingHref(event, new URL(window.location.href));
      if (!next) return;
      event.preventDefault();
      event.stopPropagation();
      setHref(next);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active]);

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) setHref(null);
      }}
      open={href !== null}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave without publishing?</AlertDialogTitle>
          <AlertDialogDescription>
            Your changes aren&apos;t live yet: scans keep opening the page as it
            was last published. They stay saved in this browser, so you can
            publish them when you come back.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            onClick={() => {
              const next = href;
              setHref(null);
              if (next) router.push(next);
            }}
            variant="ghost"
          >
            Leave
          </Button>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
