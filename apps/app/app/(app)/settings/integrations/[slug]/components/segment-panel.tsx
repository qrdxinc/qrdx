"use client";

import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Switch } from "@repo/design-system/components/ui/switch";
import type { SinkStream, SyncState } from "@repo/integrations";
import {
  readSegmentSettings,
  SEGMENT_EVENT_NAME_MAX,
  type SegmentRegion,
} from "@repo/integrations/src/integrations/segment/settings";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { SyncStatus } from "@/components/data-connections/sync-status";
import { emitSound } from "@/components/editor/sound";
import {
  DataConnectionError,
  loadSinkView,
  retrySinkNow,
  type SinkViewData,
  saveSink,
  sendSegmentTestEvent,
} from "@/lib/data-connections/client";

interface StreamForm {
  enabled: boolean;
  event: string;
}

interface StreamSectionProps {
  title: string;
  help: string;
  noun: string;
  value: StreamForm;
  onChange: (value: StreamForm) => void;
  state: SyncState | null;
  onRetry: () => void;
  retrying: boolean;
}

/** One stream: its switch, its event name and its last sync. */
function StreamSection({
  title,
  help,
  noun,
  value,
  onChange,
  state,
  onRetry,
  retrying,
}: StreamSectionProps) {
  const t = useTranslations("app.settings.integrations.segmentPanel");
  const id = useId();
  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor={`${id}-on`}>{title}</Label>
          <p className="text-muted-foreground text-sm text-pretty">{help}</p>
        </div>
        <Switch
          checked={value.enabled}
          id={`${id}-on`}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-event`}>{t("eventName")}</Label>
        <Input
          aria-invalid={!value.event.trim() || undefined}
          className="sm:max-w-sm"
          id={`${id}-event`}
          maxLength={SEGMENT_EVENT_NAME_MAX}
          onChange={(event) =>
            onChange({ ...value, event: event.target.value })
          }
          value={value.event}
        />
      </div>
      <SyncStatus
        noun={noun}
        onRetry={onRetry}
        retrying={retrying}
        state={state}
      />
    </div>
  );
}

/**
 * Segment: the workspace region, and for scans and form responses each a
 * switch, an event name and the last sync; plus a test event, since Segment
 * accepts any write key.
 */
export function SegmentPanel() {
  const t = useTranslations("app.settings.integrations.segmentPanel");
  const id = useId();
  const [view, setView] = useState<SinkViewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState<SegmentRegion>("us");
  const [scans, setScans] = useState<StreamForm>({ enabled: false, event: "" });
  const [responses, setResponses] = useState<StreamForm>({
    enabled: false,
    event: "",
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [retrying, setRetrying] = useState<SinkStream | null>(null);

  const show = useCallback((data: SinkViewData) => {
    setView(data);
    const settings = readSegmentSettings(data.settings);
    setRegion(settings.region);
    setScans({
      enabled: Boolean(data.streams?.scans?.enabled),
      event: settings.scanEvent,
    });
    setResponses({
      enabled: Boolean(data.streams?.responses?.enabled),
      event: settings.responseEvent,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSinkView("segment")
      .then((data) => !cancelled && show(data))
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof DataConnectionError ? err.message : t("couldntLoad"),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [show, t]);

  const named = scans.event.trim() && responses.event.trim();

  const save = async () => {
    setSaving(true);
    try {
      show(await saveSink("segment", { region, scans, responses }));
      emitSound("success");
      toast.success(
        scans.enabled || responses.enabled ? t("sendingToSegment") : t("saved"),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("couldntSave"));
    } finally {
      setSaving(false);
    }
  };

  const retry = async (stream: SinkStream) => {
    setRetrying(stream);
    try {
      // The statuses only: edits not saved yet stay in the form.
      setView(await retrySinkNow("segment", stream));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("retryFailed"));
    } finally {
      setRetrying(null);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      await sendSegmentTestEvent(region);
      toast.success(t("testSent"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("testFailed"));
    } finally {
      setTesting(false);
    }
  };

  if (!view) {
    return (
      <div className="rounded-xl border bg-card p-6">
        {error ? (
          <p className="text-muted-foreground text-sm text-pretty">{error}</p>
        ) : (
          <ModuleOrbit
            aria-hidden
            className="mx-auto size-5 text-muted-foreground"
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-muted-foreground text-sm text-pretty">
          {t("intro")}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${id}-region`}>{t("region")}</Label>
        <Select
          onValueChange={(value) => setRegion(value as SegmentRegion)}
          value={region}
        >
          <SelectTrigger className="w-full sm:max-w-sm" id={`${id}-region`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="us">{t("regionUs")}</SelectItem>
            <SelectItem value="eu">{t("regionEu")}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs text-pretty">
          {t("regionHelp")}
        </p>
      </div>

      <StreamSection
        help={t("scansHelp")}
        noun={t("scansNoun")}
        onChange={setScans}
        onRetry={() => retry("scans")}
        retrying={retrying === "scans"}
        state={view.streams?.scans ?? null}
        title={t("scans")}
        value={scans}
      />
      <StreamSection
        help={t("responsesHelp")}
        noun={t("responsesNoun")}
        onChange={setResponses}
        onRetry={() => retry("responses")}
        retrying={retrying === "responses"}
        state={view.streams?.responses ?? null}
        title={t("responses")}
        value={responses}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2 sm:max-w-md">
          <p className="text-muted-foreground text-xs text-pretty">
            {t("testHelp")}
          </p>
          <Button
            disabled={testing}
            onClick={test}
            type="button"
            variant="outline"
          >
            {testing && <ModuleOrbit aria-hidden className="size-4" />}
            {t("sendTest")}
          </Button>
        </div>
        <Button disabled={saving || !named} onClick={save} type="button">
          {saving && <ModuleOrbit aria-hidden className="size-4" />}
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
