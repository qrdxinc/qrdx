"use client";

import { useSyncExternalStore } from "react";
import { NewTag } from "@/components/new-tag";
import { isNewIn } from "@/lib/whats-new";
import { NEW_LOOKS } from "@/lib/whats-new/looks";

const subscribe = () => () => {};

/**
 * Whether a Design control (NEW_LOOKS id) is still new. The playground is
 * a static page, so it's decided in the browser after hydration (the server
 * and a build say no): no hydration mismatch when a build outlives the
 * batch's date. `now` is for tests.
 */
export function useIsNewLook(id: string | undefined, now?: Date): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (id ? isNewIn(NEW_LOOKS, id, now) : false),
    () => false,
  );
}

/** The "New" pill next to a recently added Design control (NEW_LOOKS). */
export function NewLookTag({
  id,
  now,
  className,
}: {
  id: string;
  now?: Date;
  className?: string;
}) {
  const isNew = useIsNewLook(id, now);
  return isNew ? <NewTag className={className} /> : null;
}
