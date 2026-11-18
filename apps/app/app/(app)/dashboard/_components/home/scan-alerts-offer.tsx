"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { Notification, TickCircle } from "iconsax-reactjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { setNotificationEmailEvents } from "@/app/(app)/settings/notifications/_lib/actions";
import { SCAN_MILESTONES } from "@/lib/events/types";
import { SCAN_ALERT_EVENTS } from "./pro-moments-rules";

const hiddenKey = (organizationId: string) =>
  `qrdx:scan-alerts-offer-hidden:${organizationId}`;

function readHidden(organizationId: string): boolean {
  try {
    return window.localStorage.getItem(hiddenKey(organizationId)) === "1";
  } catch {
    return false;
  }
}

function writeHidden(organizationId: string) {
  try {
    window.localStorage.setItem(hiddenKey(organizationId), "1");
  } catch {
    // Blocked storage: the offer shows again next visit.
  }
}

/**
 * "Turn on scan emails" in one click, on plans that include them, for people
 * who haven't set up email notifications for the workspace yet. It sets the
 * person's email events through Settings → Notifications' own action (first
 * scans, milestones, the weekly summary), which checks the plan again.
 * `dismissible` adds "Not now", remembered in this browser.
 */
export function ScanAlertsOffer({
  organizationId,
  dismissible = false,
}: {
  organizationId: string;
  dismissible?: boolean;
}) {
  const t = useTranslations("app.dashboard.home.scanAlertsOffer");
  const [state, setState] = useState<"idle" | "on">("idle");
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(dismissible);
  const [pending, startTransition] = useTransition();

  // Read after mount: the server can't see this browser's choice.
  useEffect(() => {
    if (dismissible) setHidden(readHidden(organizationId));
  }, [dismissible, organizationId]);

  if (hidden) return null;

  const turnOn = () => {
    setError(null);
    startTransition(async () => {
      const result = await setNotificationEmailEvents({
        organizationId,
        events: [...SCAN_ALERT_EVENTS],
      });
      if (result.ok) setState("on");
      else setError(result.error);
    });
  };

  const [, first, second, third] = SCAN_MILESTONES;

  return (
    <Card className="flex-row items-start gap-3 p-4 shadow-xs">
      <span className="grid size-8 shrink-0 place-items-center rounded-full border bg-muted/40">
        {state === "on" ? (
          <TickCircle aria-hidden className="size-4 text-foreground/80" />
        ) : (
          <Notification aria-hidden className="size-4 text-foreground/80" />
        )}
      </span>
      <div className="min-w-0 flex-1 space-y-2 text-left">
        {state === "on" ? (
          <p aria-live="polite" className="text-sm">
            {t("on")}{" "}
            <Link
              className="font-medium underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
              href="/settings/notifications"
            >
              {t("change")}
            </Link>
          </p>
        ) : (
          <>
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("title")}</p>
              <p className="text-muted-foreground text-sm text-pretty">
                {t("body", { first, second, third })}
              </p>
            </div>
            {error && (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending} onClick={turnOn} size="sm">
                {pending ? t("turningOn") : t("turnOn")}
              </Button>
              {dismissible && (
                <Button
                  onClick={() => {
                    writeHidden(organizationId);
                    setHidden(true);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  {t("notNow")}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
