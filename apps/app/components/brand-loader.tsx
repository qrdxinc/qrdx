"use client";

import {
  JackOScan,
  type LoaderProps,
  Scanframe,
} from "@repo/design-system/components/loaders";
import { useSyncExternalStore } from "react";
import {
  isHalloweenOn,
  subscribeHalloween,
} from "@/components/seasonal/use-halloween";

const serverSnapshot = () => false;

/**
 * Scanframe, the primary loader, dressed for the season: Jack-o'-scan while
 * Halloween runs (lib/seasonal.ts: 20 Oct – 2 Nov UTC, or a
 * `?season=halloween` preview; `?season=off` turns it off) unless the visitor
 * hid Halloween, exactly when the season's characters show. Use it wherever
 * the app would show Scanframe.
 *
 * Server HTML and hydration always draw Scanframe, since the server can't
 * see a preview or the visitor's choice, so hydration never mismatches; the
 * client swaps in Jack-o'-scan right after, well inside the loader's 300 ms
 * delay. A loader mounted later on the client starts as the right one.
 */
export function BrandLoader(props: LoaderProps) {
  const halloween = useSyncExternalStore(
    subscribeHalloween,
    isHalloweenOn,
    serverSnapshot,
  );
  return halloween ? <JackOScan {...props} /> : <Scanframe {...props} />;
}
