"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

/** How often, and how many times, a pending payment is checked again. */
const EVERY_MS = 4000;
const TIMES = 15;

/**
 * While the payment is in and the webhook isn't: reload the page's data every
 * few seconds for about a minute, so "active" shows without a click.
 */
export function CheckAgain() {
  const router = useRouter();
  useEffect(() => {
    let left = TIMES;
    const timer = window.setInterval(() => {
      left -= 1;
      router.refresh();
      if (left <= 0) window.clearInterval(timer);
    }, EVERY_MS);
    return () => window.clearInterval(timer);
  }, [router]);
  return null;
}

export function CheckNowButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {label}
    </Button>
  );
}
