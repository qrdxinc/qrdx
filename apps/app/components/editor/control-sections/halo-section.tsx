"use client";

import { Label } from "@repo/design-system/components/ui/label";
import { Slider } from "@repo/design-system/components/ui/slider";
import { Switch } from "@repo/design-system/components/ui/switch";
import { useTranslations } from "next-intl";
import { getSolidColor, resolveHalo } from "qrdx";
import { HALO_COLOR_DEFAULT, HALO_WIDTH_MAX, HALO_WIDTH_MIN } from "qrdx/types";
import ControlSection from "@/components/editor/control-section";
import { GradientPicker } from "@/components/editor/gradient-picker";
import type { QRStyle } from "@/types/theme";
import { haloRisk } from "./halo-rules";
import { NewLookTag } from "./new-look-tag";
import { patternName } from "./pattern-controls";

const percent = (share: number) => Math.round(share * 100);

interface HaloSectionProps {
  /** The style with defaults filled in */
  style: QRStyle;
  onChange: (halo: QRStyle["halo"]) => void;
  /** Open it (a link asked for this section) */
  expanded?: boolean;
}

/**
 * A halo: a light rim around every dot and eye (qrdx `halo`), for a code
 * placed on a picture. Its width is a share of a dot; the engine keeps it
 * between HALO_WIDTH_MIN and HALO_WIDTH_MAX, where every dot shape still
 * decodes on a light surface.
 */
export function HaloSection({ style, onChange, expanded }: HaloSectionProps) {
  const t = useTranslations("editor.controlSections.haloSection");
  const tiles = useTranslations("editor.controlSections.optionTiles");
  // A see-through background with a dot shape the halo makes unreadable on
  // a grey surface: the engine draws no halo there (qrdx getHaloRisk)
  const blocked = haloRisk(style) !== null;
  const halo = blocked ? null : resolveHalo(style.halo);
  const on = halo !== null;

  return (
    <ControlSection
      badge={<NewLookTag id="halo" />}
      expanded={expanded}
      section="halo"
      summary={
        blocked
          ? tiles("wontScanHere")
          : on
            ? `${percent(halo.width)}%`
            : t("off")
      }
      title={t("halo")}
    >
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm" htmlFor="halo-on">
          {t("showAHalo")}
        </Label>
        <Switch
          checked={on}
          disabled={blocked}
          id="halo-on"
          onCheckedChange={(next) => onChange(next ? {} : undefined)}
        />
      </div>
      {blocked ? (
        <p className="text-xs text-pretty">
          <span className="font-medium">{tiles("wontScanHere")}</span>{" "}
          <span className="text-muted-foreground">
            {t("seeThroughAHalo", {
              dots: patternName(style.bodyPattern),
            })}
          </span>
        </p>
      ) : (
        <p className="text-muted-foreground text-xs text-pretty">
          {t("aLightRimAround")}
        </p>
      )}
      {on && (
        <>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("width")}</span>
              <span className="tabular-nums">{percent(halo.width)}%</span>
            </div>
            <Slider
              aria-label={t("width")}
              max={percent(HALO_WIDTH_MAX)}
              min={percent(HALO_WIDTH_MIN)}
              onValueChange={([next]) =>
                onChange({
                  ...style.halo,
                  width: (next ?? percent(halo.width)) / 100,
                })
              }
              step={5}
              value={[percent(halo.width)]}
            />
          </div>
          <GradientPicker
            kinds={["solid"]}
            label={t("color")}
            name="halo.color"
            onChange={(color) =>
              onChange({
                ...style.halo,
                color: getSolidColor(color, HALO_COLOR_DEFAULT),
              })
            }
            value={halo.color}
          />
        </>
      )}
    </ControlSection>
  );
}
