"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useCallback, useEffect, useRef, useState } from "react";
import { checkStrongConfirmationAction } from "@/app/(app)/admin/confirm/actions";
import { useConfirmation } from "@/components/confirm-identity/provider";

type Status = "checking" | "waiting" | "failed";

/**
 * Opens "Confirm it's you" straight away (the page's provider), and goes
 * back to `next`, a page at the console's address, once this session has a
 * strong confirmation. The check is the admin pages' own
 * (checkStrongConfirmationAction): two-step verification on, and a passkey,
 * an authenticator code or a backup code in the last 10 minutes. "Go back"
 * goes to `cancel`: the same page without the console's "just confirmed"
 * marker.
 */
export function ConsoleConfirm({
  next,
  cancel,
}: {
  next: string;
  cancel: string;
}) {
  const { withConfirmation } = useConfirmation();
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);

  const confirm = useCallback(() => {
    setStatus("checking");
    setError(null);
    withConfirmation(() => checkStrongConfirmationAction(), "support-change")
      .then((result) => {
        // Cancelled, or confirmed with something that isn't enough here.
        if (result === null) {
          setStatus("waiting");
        } else if (result.ok) {
          // Another host: a full page load.
          window.location.assign(next);
        } else {
          setError(result.error);
          setStatus("failed");
        }
      })
      .catch(() => {
        setError("Something went wrong. Reload the page and try again.");
        setStatus("failed");
      });
  }, [next, withConfirmation]);

  // Once, even when React runs effects twice in development.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    confirm();
  }, [confirm]);

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button asChild variant="outline">
          <a href={cancel}>Go back</a>
        </Button>
        <Button
          aria-busy={status === "checking"}
          disabled={status === "checking"}
          onClick={confirm}
        >
          {status === "checking" ? "Checking…" : "Confirm it's you"}
        </Button>
      </div>
    </div>
  );
}

/** Without two-step verification: where to turn it on, or back. */
export function TwoFactorFirst({ cancel }: { cancel: string }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Button asChild variant="outline">
        <a href={cancel}>Go back</a>
      </Button>
      <Button asChild>
        <a href="/settings/account#two-factor">Account settings</a>
      </Button>
    </div>
  );
}
