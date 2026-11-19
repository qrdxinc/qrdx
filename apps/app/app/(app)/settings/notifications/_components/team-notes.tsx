"use client";

import { toast } from "@repo/design-system";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Switch } from "@repo/design-system/components/ui/switch";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setTeamNotesPreference } from "../_lib/actions";

/** "Notes from the QRdx team": one switch per person (lib/email/team-notes.ts). */
export function TeamNotesCard({ initialOn }: { initialOn: boolean }) {
  const t = useTranslations("app.settings.notifications.teamNotes");
  const router = useRouter();
  const [on, setOn] = useState(initialOn);
  const [isSaving, startSaving] = useTransition();

  const toggle = (next: boolean) => {
    setOn(next);
    startSaving(async () => {
      const result = await setTeamNotesPreference({ on: next });
      if (!result.ok) {
        setOn(!next);
        toast.error(result.error);
        return;
      }
      toast.success(next ? t("turnedOn") : t("turnedOff"));
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4">
          <label className="min-w-0 space-y-0.5" htmlFor="team-notes">
            <span className="block text-sm font-medium">{t("label")}</span>
            <span className="text-muted-foreground block text-xs">
              {t("hint")}
            </span>
          </label>
          <Switch
            checked={on}
            disabled={isSaving}
            id="team-notes"
            onCheckedChange={toggle}
          />
        </div>
      </CardContent>
    </Card>
  );
}
