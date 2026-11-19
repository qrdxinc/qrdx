"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState, useTransition } from "react";

/** How often, and how many times, a processing payment is checked again. */
export const CHECK_EVERY_MS = 4000;
export const CHECK_TIMES = 15;

/**
 * While the payment is processing: reload the page's data every few seconds
 * for about a minute, so "active" shows without a click. When the checks
 * stop and the payment still hasn't settled, say so and offer a reload (the
 * page unmounts this once the plan is active).
 */
export function CheckAgain({
  labels,
}: {
  labels: { stopped: ReactNode; reload: string };
}) {
  const router = useRouter();
  const [stopped, setStopped] = useState(false);
  useEffect(() => {
    let left = CHECK_TIMES;
    const timer = window.setInterval(() => {
      left -= 1;
      router.refresh();
      if (left <= 0) {
        window.clearInterval(timer);
        setStopped(true);
      }
    }, CHECK_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [router]);
  if (!stopped) return null;
  return (
    <div
      aria-live="polite"
      className="relative mx-auto -mt-12 flex max-w-md flex-col items-center gap-3 px-10 pb-16 text-center"
    >
      <p className="text-pretty text-sm text-muted-foreground">
        {labels.stopped}
      </p>
      <Button onClick={() => window.location.reload()} variant="outline">
        {labels.reload}
      </Button>
    </div>
  );
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
