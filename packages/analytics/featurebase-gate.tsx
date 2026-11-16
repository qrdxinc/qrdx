"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { FeaturebaseScript } from "./featurebase";
import { keys } from "./keys";

/**
 * Featurebase on the pages the app picks (`on`; default: every page), once
 * the "Functionality" consent allows it (`allowed`, consent/consent-scripts.tsx)
 * and only in production. The SDK loads on the first such page and stays for
 * the rest of the visit, hidden on other pages; a visit that never reaches
 * one never loads it.
 */
export function FeaturebaseGate({
  allowed,
  on,
}: {
  allowed: boolean;
  on?: (pathname: string) => boolean;
}) {
  const pathname = usePathname() ?? "/";
  const here = on ? on(pathname) : true;
  const [seen, setSeen] = useState(here);
  if (here && !seen) setSeen(true);

  if (
    process.env.NODE_ENV !== "production" ||
    !allowed ||
    !seen ||
    !keys().NEXT_PUBLIC_FEATUREBASE_APP_ID
  ) {
    return null;
  }
  return <FeaturebaseScript visible={here} />;
}
