"use client";

import { type Framework, FrameworkProvider } from "fumadocs-core/framework";
import Image from "next/image";
import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ZoneLink as Link } from "@/components/zone-link";
import { useZoneRouter as useRouter } from "@/components/zone-router";

/**
 * fumadocs' Next integration (fumadocs-core/framework/next), with the docs
 * zone's link and router: pages outside the docs belong to the main app and
 * load in full (components/zone-link.tsx).
 */
export function DocsFrameworkProvider({ children }: { children: ReactNode }) {
  return (
    <FrameworkProvider
      // As fumadocs-core/framework/next passes them.
      Image={Image as Framework["Image"]}
      Link={Link as Framework["Link"]}
      useParams={useParams}
      usePathname={usePathname}
      useRouter={useRouter}
    >
      {children}
    </FrameworkProvider>
  );
}
