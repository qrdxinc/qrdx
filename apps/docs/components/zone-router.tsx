"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { isDocsPage } from "@/components/zone-link";

type Router = ReturnType<typeof useRouter>;

/**
 * useRouter for the docs zone, the router version of ZoneLink
 * (components/zone-link.tsx): docs pages go through Next's router, and
 * pages outside the docs load in full from the main app.
 */
export function useZoneRouter(): Router {
  const router = useRouter();
  return useMemo(
    (): Router => ({
      ...router,
      push: (href, options) => {
        if (isDocsPage(href)) router.push(href, options);
        else window.location.assign(href);
      },
      replace: (href, options) => {
        if (isDocsPage(href)) router.replace(href, options);
        else window.location.replace(href);
      },
      prefetch: (href, options) => {
        if (isDocsPage(href)) router.prefetch(href, options);
      },
    }),
    [router],
  );
}
