"use client";

import Script from "next/script";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import { useFeaturebaseLauncherHidden } from "./featurebase-launcher";
import { keys } from "./keys";

type FeaturebaseFn = ((...args: unknown[]) => void) & { q?: unknown[] };

function featurebase(): FeaturebaseFn {
  const win = window as unknown as { Featurebase?: FeaturebaseFn };
  if (typeof win.Featurebase !== "function") {
    const queue: FeaturebaseFn = (...args) => {
      queue.q ??= [];
      queue.q.push(args);
    };
    win.Featurebase = queue;
  }
  return win.Featurebase;
}

/**
 * Featurebase messenger (feedback and support), loaded only after the
 * "Functionality" consent (consent/consent-scripts.tsx).
 *
 * Visitors stay anonymous: Featurebase asks for an email in the widget when it
 * needs one. Identifying signed-in users would need Featurebase's secure
 * installation (a server-signed token), which QRdx doesn't set up, so no
 * email or user id is sent. The widget follows the site's light or dark theme.
 */
function boot(theme: "light" | "dark", hideLauncher: boolean) {
  featurebase()("boot", {
    appId: keys().NEXT_PUBLIC_FEATUREBASE_APP_ID,
    theme,
    language: "en",
    // The editor's bottom sheets ask for the launcher to step aside while
    // they're open (featurebase-launcher.ts)
    hideDefaultLauncher: hideLauncher,
  });
}

/**
 * `visible`: whether this page shows the messenger (the app decides which
 * pages do, consent/consent-scripts.tsx). Once loaded, the SDK stays for the
 * rest of the visit, so on other pages the launcher is hidden and an open
 * messenger is closed.
 */
export const FeaturebaseScript = ({
  visible = true,
}: {
  visible?: boolean;
}) => {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const sheetOpen = useFeaturebaseLauncherHidden();
  const hideLauncher = sheetOpen || !visible;
  const loaded = useRef(false);

  // Booting again with the new theme (or launcher setting) is how
  // Featurebase switches it.
  useEffect(() => {
    if (loaded.current) boot(theme, hideLauncher);
  }, [theme, hideLauncher]);

  // Leaving a page that shows it closes the messenger if it was open.
  useEffect(() => {
    if (loaded.current && !visible) featurebase()("hide");
  }, [visible]);

  return (
    <Script
      id="featurebase-sdk"
      onLoad={() => {
        loaded.current = true;
        boot(theme, hideLauncher);
      }}
      src="https://do.featurebase.app/js/sdk.js"
      strategy="afterInteractive"
    />
  );
};
