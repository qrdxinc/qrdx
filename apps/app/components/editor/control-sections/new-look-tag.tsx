"use client";

import { useSyncExternalStore } from "react";
import { NewTag } from "@/components/new-tag";
import { isNewIn } from "@/lib/whats-new";
import { NEW_LOOKS } from "@/lib/whats-new/looks";

const subscribe = () => () => {};

/**
 * The "New" pill next to a recently added Design control (NEW_LOOKS). The
 * playground is a static page, so whether a look is still new is decided
 * in the browser after hydration (the server and a build render nothing):
 * no hydration mismatch when a build outlives the batch's date.
 * `now` is for tests.
 */
export function NewLookTag({
  id,
  now,
  className,
}: {
  id: string;
  now?: Date;
  className?: string;
}) {
  const isNew = useSyncExternalStore(
    subscribe,
    () => isNewIn(NEW_LOOKS, id, now),
    () => false,
  );
  return isNew ? <NewTag className={className} /> : null;
}
