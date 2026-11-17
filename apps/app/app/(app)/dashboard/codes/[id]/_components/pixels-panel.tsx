"use client";

import { toast } from "@repo/design-system";
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
import { useTranslations } from "next-intl";
import { Suspense, useId, useState, useTransition } from "react";
import {
  type CodeMarketingSettings,
  saveCodePixels,
} from "@/actions/code-marketing";
import { useAvailability } from "@/components/availability-provider";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { ConversionsSection } from "@/ee/conversions/conversions-section";
import { type PaidPlan, PLAN_NAMES } from "@/lib/pricing";
import type { PixelConfig, PixelProvider } from "@/lib/redirect/routing";
import {
  MarketingSettingsGate,
  type MarketingSettingsPromise,
  PanelCard,
  PanelError,
  PanelFallback,
  PlanLock,
} from "./routing-panel";

const PROVIDERS: {
  key: PixelProvider;
  label: string;
  placeholder: string;
  hint?: string;
}[] = [
  {
    key: "ga4",
    label: "Google Analytics 4 measurement ID",
    placeholder: "G-XXXXXXXXXX",
  },
  {
    key: "gtm",
    label: "Google Tag Manager container ID",
    placeholder: "GTM-XXXXXXX",
    // Containers run any script, so they stay off QRdx's own domain.
    hint: "Loads only when the page opens on one of your custom domains.",
  },
  {
    key: "meta",
    label: "Meta (Facebook) pixel ID",
    placeholder: "123456789012345",
  },
  {
    key: "tiktok",
    label: "TikTok pixel ID",
    placeholder: "CXXXXXXXXXXXXXXXXXXX",
  },
  {
    key: "linkedin",
    label: "LinkedIn Insight Tag partner ID",
    placeholder: "1234567",
  },
];

const PROVIDER_NAMES: Record<PixelProvider, string> = {
  ga4: "Google Analytics",
  gtm: "Tag Manager",
  meta: "Meta",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

type Draft = Record<PixelProvider, string> & {
  consent: "auto" | "always";
  conversions: boolean;
};

function toDraft(pixels: PixelConfig | null): Draft {
  return {
    ga4: pixels?.ga4 ?? "",
    gtm: pixels?.gtm ?? "",
    meta: pixels?.meta ?? "",
    tiktok: pixels?.tiktok ?? "",
    linkedin: pixels?.linkedin ?? "",
    consent: pixels?.consent ?? "auto",
    conversions: pixels?.conversions ?? false,
  };
}

const fromDraft = (draft: Draft) => ({
  ga4: draft.ga4.trim().toUpperCase() || undefined,
  gtm: draft.gtm.trim().toUpperCase() || undefined,
  meta: draft.meta.trim() || undefined,
  tiktok: draft.tiktok.trim().toUpperCase() || undefined,
  linkedin: draft.linkedin.trim() || undefined,
  consent: draft.consent,
  conversions: draft.conversions,
});

function PixelsEditor({
  initial,
  plans,
}: {
  initial: CodeMarketingSettings;
  plans: PixelPlans;
}) {
  const t = useTranslations("app.dashboard.codes.pixelsPanel");
  const id = useId();
  const [settings, setSettings] = useState(initial);
  const [draft, setDraftState] = useState(() => toDraft(initial.pixels));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isPage = settings.kind === "page";
  const locked = !settings.features.pixels;
  const dirty =
    JSON.stringify(fromDraft(draft)) !==
    JSON.stringify(fromDraft(toDraft(settings.pixels)));
  const setDraft = (patch: Partial<Draft>) =>
    setDraftState((current) => ({ ...current, ...patch }));
  // Tag Manager only loads on custom domains: no field for it where they
  // can't be added, unless this code already has a container to remove.
  const { has } = useAvailability();
  const providers = PROVIDERS.filter(
    (provider) =>
      provider.key !== "gtm" ||
      has("customDomains") ||
      Boolean(settings.pixels?.gtm),
  );
  // Website links only offer conversion tracking (ee/conversions), which
  // needs the QRdx licence key on the server: without it, no panel at all.
  const conversions = has("conversions");

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveCodePixels({
        id: settings.codeId,
        pixels: fromDraft(draft),
      });
      if (result.success) {
        setSettings(result.data);
        setDraftState(toDraft(result.data.pixels));
        toast.success(t("trackingSettingsSaved"));
      } else {
        setError(result.error.message);
      }
    });
  };

  if (!(isPage || conversions)) return null;
  return (
    <PanelCard
      badge={isPage ? plans.pixels : plans.conversions}
      description={
        <>
          {isPage
            ? t("loadYourOwnAnalyticsAnd")
            : t("thisCodeOpensYourWebsite")}{" "}
          <Link className="underline" href="/docs/tracking-and-conversions">
            {t("learnMore")}
          </Link>
        </>
      }
      title={isPage ? t("trackingPixels") : t("conversionTracking")}
    >
      {isPage && (
        <>
          {locked && plans.pixels && (
            <PlanLock plan={plans.pixels}>
              {PROVIDERS.some((provider) => settings.pixels?.[provider.key])
                ? t("yourPlanDoesntIncludeTracking", {
                    value: PLAN_NAMES[plans.pixels],
                  })
                : t("trackingPixelsValueArePart", {
                    value: providers
                      .map((provider) => PROVIDER_NAMES[provider.key])
                      .join(", "),
                    value2: PLAN_NAMES[plans.pixels],
                  })}
            </PlanLock>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {providers.map((provider) => (
              <div className="space-y-1" key={provider.key}>
                <Label htmlFor={`${id}-${provider.key}`}>
                  {provider.label}
                </Label>
                <Input
                  autoComplete="off"
                  disabled={locked && !draft[provider.key]}
                  id={`${id}-${provider.key}`}
                  maxLength={30}
                  onChange={(event) =>
                    setDraft({
                      [provider.key]: event.target.value,
                    } as Partial<Draft>)
                  }
                  placeholder={provider.placeholder}
                  spellCheck={false}
                  value={draft[provider.key]}
                />
                {provider.hint && (
                  <p className="text-muted-foreground text-xs">
                    {provider.hint}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-consent`}>{t("cookieConsentBanner")}</Label>
            <Select
              onValueChange={(consent) =>
                setDraft({ consent: consent as Draft["consent"] })
              }
              value={draft.consent}
            >
              <SelectTrigger className="w-full sm:w-96" id={`${id}-consent`}>
                <SelectValue />
              </SelectTrigger>
              {/* Above the code builder's dialog (z-[99]), which shows this panel too */}
              <SelectContent className="z-[120]">
                <SelectItem value="auto">
                  {t("whereRequiredEuEeaUk")}
                </SelectItem>
                <SelectItem value="always">{t("forEveryVisitor")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {t("pixelsNeverLoadBeforeA")}
            </p>
          </div>
        </>
      )}

      {!isPage && (
        <ConversionsSection
          enabled={draft.conversions}
          onEnabledChange={(on) => setDraft({ conversions: on })}
          plan={plans.conversions}
          settings={settings}
        />
      )}

      {error && <PanelError message={error} />}
      <div className="flex justify-end gap-2">
        {dirty && (
          <Button
            disabled={isPending}
            onClick={() => setDraftState(toDraft(settings.pixels))}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("discard")}
          </Button>
        )}
        <Button
          disabled={isPending || !dirty}
          onClick={save}
          size="sm"
          type="button"
        >
          {isPending ? t("saving") : t("save")}
        </Button>
      </div>
    </PanelCard>
  );
}

/** Owner pixels for hosted pages and conversion tracking for website links. */
/** The cheapest plans with pixels and with conversions (lib/plans.ts). */
export interface PixelPlans {
  pixels: PaidPlan | null;
  conversions: PaidPlan | null;
}

export function PixelsPanel({
  settings,
  plans,
}: {
  settings: MarketingSettingsPromise;
  plans: PixelPlans;
}) {
  const t = useTranslations("app.dashboard.codes.pixelsPanel");
  return (
    <Suspense fallback={<PanelFallback />}>
      <MarketingSettingsGate settings={settings} title={t("tracking")}>
        {(data) => <PixelsEditor initial={data} plans={plans} />}
      </MarketingSettingsGate>
    </Suspense>
  );
}
