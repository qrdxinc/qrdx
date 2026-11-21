"use client";

import { Label } from "@repo/design-system/components/ui/label";
import { Slider } from "@repo/design-system/components/ui/slider";
import { Switch } from "@repo/design-system/components/ui/switch";
import { ArrowRight } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { getSolidColor, type HaloRefusal, resolveHalo } from "qrdx";
import { HALO_COLOR_DEFAULT, HALO_WIDTH_MAX, HALO_WIDTH_MIN } from "qrdx/types";
import { useId } from "react";
import ControlSection from "@/components/editor/control-section";
import { GradientPicker } from "@/components/editor/gradient-picker";
import { SwatchDot } from "@/components/editor/paint-picker/controls";
import { SwatchGrid } from "@/components/editor/paint-picker/paint-panel";
import type { QRStyle } from "@/types/theme";
import {
  haloDotTints,
  haloDrawnAs,
  haloRisk,
  haloSwitch,
  haloToTurnOn,
} from "./halo-rules";
import { NewLookTag } from "./new-look-tag";

const percent = (share: number) => Math.round(share * 100);

/** The copy that says why the engine draws no halo (qrdx HaloRefusal reason). */
const REASON_COPY = {
  "see-through": "seeThroughBackground",
  picture: "pictureBackground",
  "dark-background": "darkBackground",
} as const satisfies Record<HaloRefusal["reason"], string>;

interface HaloSectionProps {
  /** The style with defaults filled in */
  style: QRStyle;
  onChange: (halo: QRStyle["halo"]) => void;
  /** Open it (a link asked for this section) */
  expanded?: boolean;
}

/**
 * The collapsed section's summary: "Won't scan here" while a halo is on
 * where the engine can't draw it, its width while it's drawn, else `off`.
 */
export function haloSummary(
  style: QRStyle,
  copy: { off: string; wontScanHere: string },
): string {
  if (style.halo === undefined) return copy.off;
  if (haloRisk(style)) return copy.wontScanHere;
  const halo = resolveHalo(style.halo);
  return halo ? `${percent(halo.width)}%` : copy.off;
}

/**
 * A halo: a light rim around every dot and eye (qrdx `halo`). Its width is
 * a share of a dot, between HALO_WIDTH_MIN and HALO_WIDTH_MAX. The engine
 * draws it only on an opaque, light background, where any color can be
 * picked: one decoders would misread is drawn in the closest color they
 * read (qrdx fitHaloColor), shown next to the picked one. Where no halo is
 * drawn, this section says why, and the switch still turns it off.
 */
export function HaloSection({ style, onChange, expanded }: HaloSectionProps) {
  const t = useTranslations("editor.controlSections.haloSection");
  const tiles = useTranslations("editor.controlSections.optionTiles");

  return (
    <ControlSection
      badge={<NewLookTag id="halo" />}
      expanded={expanded}
      section="halo"
      summary={haloSummary(style, {
        off: t("off"),
        wontScanHere: tiles("wontScanHere"),
      })}
      title={t("halo")}
    >
      <HaloControl onChange={onChange} style={style} />
    </ControlSection>
  );
}

/**
 * The halo's switch, why it isn't drawn here, its width and color (with
 * the color drawn when the engine moved it, and tints of the dots' color
 * drawn as they are): the Halo section, and the preview's dots toolbar.
 */
export function HaloControl({
  style,
  onChange,
}: Omit<HaloSectionProps, "expanded">) {
  const t = useTranslations("editor.controlSections.haloSection");
  const tiles = useTranslations("editor.controlSections.optionTiles");
  const switchId = useId();
  const on = style.halo !== undefined;
  // Why the engine wouldn't draw it here (with one switched on)
  const risk = haloRisk(style);
  // The values shown: the style's, with the defaults filled in
  const halo = on ? resolveHalo(style.halo) : null;
  const reason = risk && REASON_COPY[risk.reason];
  // The color the engine draws instead of the picked one, if it moved it
  const drawn = halo ? haloDrawnAs(style) : null;
  const tints = halo ? haloDotTints(style) : [];
  const pick = (color: string) => onChange({ ...style.halo, color });

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm" htmlFor={switchId}>
          {t("showAHalo")}
        </Label>
        {/* Off is always one click away; on only where it can be drawn */}
        <Switch
          {...haloSwitch(style)}
          id={switchId}
          onCheckedChange={(next) =>
            onChange(next ? haloToTurnOn(style) : undefined)
          }
        />
      </div>
      {reason ? (
        <p className="text-xs text-pretty">
          <span className="font-medium">{tiles("wontScanHere")}</span>{" "}
          <span className="text-muted-foreground">{t(reason)}</span>
        </p>
      ) : (
        <p className="text-muted-foreground text-xs text-pretty">
          {t("aLightRimAround")}
        </p>
      )}
      {halo && (
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
          <div className="space-y-2">
            {/* The engine draws the rim opaque (qrdx resolveHalo) */}
            <GradientPicker
              alpha={false}
              kinds={["solid"]}
              label={t("color")}
              name="halo.color"
              onChange={(color) => pick(getSolidColor(color, HALO_COLOR_DEFAULT))}
              value={halo.color}
            />
            {drawn && (
              <p
                className="flex items-center gap-2 text-xs"
                data-halo-drawn={drawn}
              >
                <span aria-hidden="true" className="flex items-center gap-1">
                  <SwatchDot background={halo.color} className="size-4" />
                  <ArrowRight className="text-muted-foreground size-3" />
                  <SwatchDot background={drawn} className="size-4" />
                </span>
                <span className="text-muted-foreground text-pretty">
                  {t("drawnAs", { color: drawn.toUpperCase() })}
                </span>
              </p>
            )}
          </div>
          {tints.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-muted-foreground text-xs">
                {t("tintsOfYourDots")}
              </p>
              <SwatchGrid
                colors={tints}
                current={halo.color}
                empty=""
                onPick={pick}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
