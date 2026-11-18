"use client";

import { useEffect, useState } from "react";
import { useAvailability } from "@/components/availability-provider";
import {
  type SignInOptions,
  signInOptionsFrom,
} from "@/lib/auth/sign-in-options";
import { loadSignInOptions } from "./sign-in-options-action";

// What the running server offers, asked once per page load and shared by
// every panel on it; a failed ask is tried again next time.
let serverOptions: Promise<SignInOptions> | null = null;

function askServer(): Promise<SignInOptions> {
  serverOptions ??= loadSignInOptions().catch((error: unknown) => {
    serverOptions = null;
    throw error;
  });
  return serverOptions;
}

export interface SignInOptionsAnswer {
  options: SignInOptions;
  /** `options` is the running server's answer, given or received. */
  confirmed: boolean;
  /**
   * Asking the server failed: an action ID from an older deploy, the
   * network, or a proxy whose Host doesn't match Origin (Next refuses the
   * action then). `options` is still the root layout's guess, which proves
   * nothing about the server, so it never means "not set up". `retry` asks
   * again.
   */
  failed: boolean;
  retry: () => void;
}

/**
 * The ways in to show: `given` when the page worked them out on the server
 * for this request (/sign-in), else the root layout's answer until the
 * running server's arrives (sign-in-options-action.ts), asked once `shown`.
 */
export function useSignInOptions(
  given: SignInOptions | undefined,
  shown: boolean,
): SignInOptionsAnswer {
  const availability = useAvailability();
  const [fromServer, setFromServer] = useState<SignInOptions | null>(null);
  // The last ask failed; retry() clears it, which asks again.
  const [failed, setFailed] = useState(false);
  const guess = signInOptionsFrom(availability.has);

  useEffect(() => {
    if (given || !shown || fromServer || failed) return;
    let cancelled = false;
    askServer()
      .then((options) => {
        if (!cancelled) setFromServer(options);
      })
      .catch((error: unknown) => {
        console.error("Couldn't ask the server how to sign in:", error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [given, shown, fromServer, failed]);

  const retry = () => setFailed(false);

  if (given) return { options: given, confirmed: true, failed: false, retry };
  if (fromServer) {
    return { options: fromServer, confirmed: true, failed: false, retry };
  }
  return { options: guess, confirmed: false, failed, retry };
}
