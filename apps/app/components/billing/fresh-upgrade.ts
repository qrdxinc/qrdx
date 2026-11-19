"use client";

import { authClient } from "@repo/auth/client";
import { useEffect, useRef, useState } from "react";
import { useSubscription } from "@/lib/hooks/use-subscription";
import { freshUpgradeAnswer, type UpgradeAnswer } from "./checkout-choice";

/**
 * Whether this person's purchase lifts the plan of the workspace this
 * tab's requests go to, read again from GET /api/subscription each time
 * `active` turns on (a gate opened, upgrade buttons are about to show).
 * The cached read is shared by every workspace and may predate another
 * tab's switch, so it never counts: "waiting" until the new answer.
 */
export function useFreshWorkspaceUpgrade(active: boolean): UpgradeAnswer {
  const { data: session } = authClient.useSession();
  const on = active && Boolean(session?.user);
  const query = useSubscription();
  const refetch = useRef(query.refetch);
  refetch.current = query.refetch;
  const [since, setSince] = useState<number | null>(null);
  useEffect(() => {
    if (!on) {
      setSince(null);
      return;
    }
    setSince(Date.now());
    void refetch.current();
  }, [on]);
  return freshUpgradeAnswer({
    // Before the effect has run, nothing read so far counts.
    since: on ? (since ?? Number.POSITIVE_INFINITY) : null,
    dataUpdatedAt: query.dataUpdatedAt,
    errorUpdatedAt: query.errorUpdatedAt,
    fetching: query.isFetching,
    answer: query.subscriptionStatus?.canUpgradeWorkspace,
  });
}
