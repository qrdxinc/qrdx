"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { Progress } from "@repo/design-system/components/ui/progress";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight2, TickCircle } from "iconsax-reactjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { useCreate } from "@/components/app-shell/create-actions";
import { useSpotlightsSeen } from "@/components/app-shell/feature-spotlight";
import { useCan } from "@/components/workspace-provider";
import type { FirstSteps } from "./first-run-rules";

const ROW = "flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm";
const OPEN =
  "group hover:bg-muted focus-visible:ring-ring/50 outline-none transition-colors focus-visible:ring-[3px]";

function Step({
  done,
  label,
  hint,
  action,
  doneLabel,
}: {
  done: boolean;
  label: string;
  hint: string;
  /** What to do next: a link or a button around the row; none once done */
  action?: { text: string; href?: string; onClick?: () => void };
  doneLabel: string;
}) {
  if (done) {
    return (
      <div className={cn(ROW, "text-muted-foreground")}>
        <TickCircle
          aria-hidden
          className="text-primary size-5 shrink-0"
          variant="Bold"
        />
        <span className="decoration-muted-foreground/50 min-w-0 flex-1 line-through">
          {label}
          <span className="sr-only"> {doneLabel}</span>
        </span>
      </div>
    );
  }
  const body: ReactNode = (
    <>
      <span
        aria-hidden
        className="border-muted-foreground/45 m-0.5 size-4 shrink-0 rounded-full border-[1.5px]"
      />
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        <span className="text-muted-foreground block text-xs text-pretty">
          {hint}
        </span>
      </span>
      {action && (
        <span
          aria-hidden
          className="text-muted-foreground group-hover:text-foreground flex shrink-0 items-center gap-1 text-xs font-medium transition-colors"
        >
          {action.text}
          <ArrowRight2 className="size-3" />
        </span>
      )}
    </>
  );
  if (action?.href) {
    return (
      <Link className={cn(ROW, OPEN)} href={action.href}>
        {body}
      </Link>
    );
  }
  if (action?.onClick) {
    return (
      <button className={cn(ROW, OPEN)} onClick={action.onClick} type="button">
        {body}
      </button>
    );
  }
  return <div className={ROW}>{body}</div>;
}

/**
 * Home's first steps (first-run-rules.ts): make a dynamic code, scan it with
 * your phone, download it for print. Ticked from real data; it goes once all
 * three are done, or for good once hidden (the account remembers it with the
 * spotlights). Only for people who can make codes. `codeHref`: the newest
 * code's page, where it can be scanned and downloaded.
 */
export function FirstStepsCard({
  steps,
  codeHref,
}: {
  steps: FirstSteps;
  codeHref: string | null;
}) {
  const t = useTranslations("app.dashboard.home.firstSteps");
  const create = useCreate();
  const canWrite = useCan("content.write");
  const spotlights = useSpotlightsSeen();
  const [hidden, setHidden] = useState(false);
  // Nothing until this browser's copy of what was hidden is read.
  if (!(canWrite && spotlights) || hidden) return null;
  if (spotlights.seen.has("home-first-steps")) return null;

  const downloaded =
    steps.downloaded || spotlights.seen.has("first-download");
  const open = codeHref ? { href: codeHref } : {};
  const rows = [
    {
      key: "make",
      done: steps.made,
      label: t("make"),
      hint: t("makeHint"),
      action: { text: t("create"), onClick: () => create("code") },
    },
    {
      key: "scan",
      done: steps.scanned,
      label: t("scan"),
      hint: t("scanHint"),
      action: codeHref ? { text: t("showCode"), ...open } : undefined,
    },
    {
      key: "download",
      done: downloaded,
      label: t("download"),
      hint: t("downloadHint"),
      action: codeHref ? { text: t("downloadAction"), ...open } : undefined,
    },
  ];
  const done = rows.filter((row) => row.done).length;
  if (done === rows.length) return null;

  return (
    <Card className="gap-0 p-0 shadow-xs">
      <div className="flex items-start gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight">{t("title")}</h2>
          <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
            {t("progress", { done, total: rows.length })}
          </p>
        </div>
        <Button
          className="text-muted-foreground -mt-1 -mr-2"
          onClick={() => {
            setHidden(true);
            spotlights.markSeen("home-first-steps");
          }}
          size="sm"
          variant="ghost"
        >
          {t("hide")}
        </Button>
      </div>
      <div className="px-5 pb-3">
        <Progress
          aria-label={t("progressLabel")}
          className="bg-muted h-1.5"
          value={(done / rows.length) * 100}
        />
      </div>
      <ol className="border-t p-1.5">
        {rows.map((row) => (
          <li key={row.key}>
            <Step
              action={row.done ? undefined : row.action}
              done={row.done}
              doneLabel={t("done")}
              hint={row.hint}
              label={row.label}
            />
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** The empty "Recent codes" card's way in: the new-code dialog. */
export function FirstCodeButton() {
  const t = useTranslations("app.dashboard.home.firstSteps");
  const create = useCreate();
  const canWrite = useCan("content.write");
  if (!canWrite) return null;
  return (
    <Button className="mt-3" onClick={() => create("code")} size="sm">
      {t("makeFirstCode")}
    </Button>
  );
}
