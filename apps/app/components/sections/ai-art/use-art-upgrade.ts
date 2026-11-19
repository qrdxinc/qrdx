"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useCheckoutChoice } from "@/components/billing/checkout-buttons";
import { useFreshWorkspaceUpgrade } from "@/components/billing/fresh-upgrade";
import { artUpgradePlan, offersArtUpgrade } from "./ai-art-run";
import type { AIArtCredits } from "./config";
import { AI_ART_CREDITS_QUERY_KEY } from "./use-ai-art-run";

/**
 * The upgrade the art surfaces offer when images run short (`short`): the
 * plan that lifts the allowance, whether to offer it, and whether its
 * buttons wait. Who may buy it, and the credits themselves, are read again
 * when it would show: another tab may have switched the session to a
 * workspace whose plan this person doesn't pay for.
 */
export function useArtUpgrade(credits: AIArtCredits | null, short: boolean) {
  const target = artUpgradePlan(credits);
  const sells = useCheckoutChoice(target).choice.kind !== "none";
  const wanted = short && offersArtUpgrade(credits, sells);
  const answer = useFreshWorkspaceUpgrade(wanted);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (wanted) {
      void queryClient.invalidateQueries({
        queryKey: AI_ART_CREDITS_QUERY_KEY,
      });
    }
  }, [wanted, queryClient]);
  return {
    target,
    offer: wanted && (answer === "yes" || answer === "waiting"),
    waiting: answer === "waiting",
  };
}
