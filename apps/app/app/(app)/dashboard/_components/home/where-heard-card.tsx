"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { saveWhereHeard } from "@/actions/where-heard";
import { useSpotlightsSeen } from "@/components/app-shell/feature-spotlight";
import {
  WHERE_HEARD_ANSWERS,
  WHERE_HEARD_TEXT_MAX,
  type WhereHeardAnswer,
} from "@/lib/where-heard";

type State = "asking" | "other" | "thanks" | "gone";

/**
 * "Where did you first hear about QRdx?" (lib/where-heard.ts): one tap on
 * an answer saves it; "Other" asks for a few words first. Optional and
 * asked once: an answer or "Hide" ends it for good, and a failed save
 * (before the columns exist) just closes it.
 */
export function WhereHeardCard() {
  const t = useTranslations("app.dashboard.home.whereHeard");
  const spotlights = useSpotlightsSeen();
  const [state, setState] = useState<State>("asking");
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const headingId = useId();
  const inputId = useId();
  // Nothing until this browser's copy of what was hidden is read.
  if (!spotlights || state === "gone") return null;
  if (state !== "thanks" && spotlights.seen.has("where-heard")) return null;

  const save = (answer: WhereHeardAnswer, words?: string) =>
    startTransition(async () => {
      const result = await saveWhereHeard(answer, words ?? null).catch(
        () => ({ ok: false }) as const,
      );
      if (!result.ok) {
        setState("gone");
        return;
      }
      spotlights.markSeen("where-heard");
      setState("thanks");
    });

  if (state === "thanks") {
    return (
      <Card className="p-5 shadow-xs" role="status">
        <p className="text-muted-foreground text-sm">{t("thanks")}</p>
      </Card>
    );
  }

  return (
    <Card
      aria-labelledby={headingId}
      className="gap-3 p-5 shadow-xs"
      role="group"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-sm font-semibold tracking-tight" id={headingId}>
            {t("question")}
          </h2>
          <p className="text-muted-foreground text-sm text-pretty">
            {t("why")}
          </p>
        </div>
        <Button
          className="text-muted-foreground -mt-1 -mr-2"
          disabled={pending}
          onClick={() => {
            spotlights.markSeen("where-heard");
            setState("gone");
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("hide")}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {WHERE_HEARD_ANSWERS.map((answer) => (
          <Button
            aria-pressed={answer === "other" ? state === "other" : undefined}
            className={cn(
              "rounded-full",
              answer === "other" && state === "other" && "bg-muted",
            )}
            disabled={pending}
            key={answer}
            onClick={() =>
              answer === "other" ? setState("other") : save(answer)
            }
            size="sm"
            type="button"
            variant="outline"
          >
            {t(`answers.${answer}`)}
          </Button>
        ))}
      </div>
      {state === "other" && (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            save("other", text);
          }}
        >
          <label className="sr-only" htmlFor={inputId}>
            {t("otherLabel")}
          </label>
          <Input
            autoFocus
            className="flex-1"
            disabled={pending}
            id={inputId}
            maxLength={WHERE_HEARD_TEXT_MAX}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("otherPlaceholder")}
            value={text}
          />
          <Button disabled={pending} size="sm" type="submit">
            {t("save")}
          </Button>
        </form>
      )}
    </Card>
  );
}
