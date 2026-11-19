"use client";

import { track } from "@repo/analytics";
import { Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LocaleLink } from "@/components/i18n/locale-link";
import { SCAN_MILESTONES } from "@/lib/events/types";
import type { CodeLiveCard as CodeLiveCardData } from "./pro-moments-rules";

const hiddenKey = (organizationId: string) =>
  `qrdx:code-live-card-hidden:${organizationId}`;

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
    // Blocked storage: the card shows again next visit.
  }
}

/**
 * Free Home, once a dynamic code exists: the code keeps working on Free,
 * and what Pro adds for a printed one (pro-moments-rules.ts picks the lines
 * this deployment can offer). "Hide" is remembered in this browser.
 */
export function CodeLiveCard({
  organizationId,
  card,
}: {
  organizationId: string;
  card: CodeLiveCardData & { month: string; year: string };
}) {
  const t = useTranslations("app.dashboard.home.codeLiveCard");
  // Hidden until this browser's choice is read, so a hidden card never flashes.
  const [hidden, setHidden] = useState(true);
  useEffect(() => setHidden(readHidden(organizationId)), [organizationId]);
  if (hidden) return null;
  // Pro's scan emails are milestones (the first scan, then 10, 100, 500 …)
  // and the weekly summary, as the offer on Pro Home says.
  const [, first, second, third] = SCAN_MILESTONES;
  const featureText = (feature: CodeLiveCardData["features"][number]) => {
    switch (feature) {
      case "fullHistory":
        return t("fullHistory", { years: card.freeHistoryYears });
      case "scanEmails":
        return t("scanEmails", { first, second, third });
      default:
        return t(feature);
    }
  };

  return (
    <Card className="gap-3 p-5 shadow-xs">
      <div className="space-y-1">
        <p className="text-sm font-semibold tracking-tight">{t("title")}</p>
        <p className="text-muted-foreground text-sm text-pretty">{t("body")}</p>
      </div>
      <ul className="space-y-1.5">
        {card.features.map((feature) => (
          <li className="flex items-start gap-2 text-sm" key={feature}>
            <Tick
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              strokeWidth={2}
            />
            <span>{featureText(feature)}</span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-sm">
        {t("price", { month: card.month, year: card.year })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <LocaleLink
            href="/pricing"
            onClick={() =>
              track("upgrade_clicked", {
                source: "home_code_live",
                plan: "pro",
              })
            }
          >
            {t("seePro")}
          </LocaleLink>
        </Button>
        <Button
          onClick={() => {
            writeHidden(organizationId);
            setHidden(true);
          }}
          size="sm"
          variant="ghost"
        >
          {t("hide")}
        </Button>
      </div>
    </Card>
  );
}
