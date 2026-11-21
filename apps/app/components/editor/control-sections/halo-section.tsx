"use client";

import { Label } from "@repo/design-system/components/ui/label";
import { Slider } from "@repo/design-system/components/ui/slider";
import { Switch } from "@repo/design-system/components/ui/switch";
import { useTranslations } from "next-intl";
import { getSolidColor, type HaloRisk, resolveHalo } from "qrdx";
import { HALO_COLOR_DEFAULT, HALO_WIDTH_MAX, HALO_WIDTH_MIN } from "qrdx/types";
import ControlSection from "@/components/editor/control-section";
import { GradientPicker } from "@/components/editor/gradient-picker";
import type { QRStyle } from "@/types/theme";
import { haloRisk, haloSwitch } from "./halo-rules";
import { NewLookTag } from "./new-look-tag";

const percent = (share: number) => Math.round(share * 100);

/** The copy that says why the engine draws no halo (qrdx HaloRisk reason). */
const REASON_COPY = {
  "see-through": "seeThroughBackground",
  picture: "pictureBackground",
  "dark-background": "darkBackground",
  rim: "rimColor",
} as const satisfies Record<HaloRisk["reason"], string>;

interface HaloSectionProps {
  /** The style with defaults filled in */
  style: QRStyle;
  onChange: (halo: QRStyle["halo"]) => void;
  /** Open it (a link asked for this section) */
  expanded?: boolean;
}

/**
 * A halo: a light rim around every dot and eye (qrdx `halo`). Its width is
 * a share of a dot, between HALO_WIDTH_MIN and HALO_WIDTH_MAX. The engine
 * draws it only on an opaque background, in a rim at least as light as
 * HALO_LIGHT_MIN and no lighter than the background (qrdx getHaloRisk);
 * where it doesn't, this section says why, and the switch still turns it
 * off.
 */
export function HaloSection({ style, onChange, expanded }: HaloSectionProps) {
  const t = useTranslations("editor.controlSections.haloSection");
  const tiles = useTranslations("editor.controlSections.optionTiles");
  const on = style.halo !== undefined;
  // Why the engine wouldn't draw it here (with one switched on)
  const risk = haloRisk(style);
  // The values shown: the style's, with the defaults filled in
  const halo = on ? resolveHalo(style.halo) : null;
  const reason = risk && REASON_COPY[risk.reason];

  return (
    <ControlSection
      badge={<NewLookTag id="halo" />}
      expanded={expanded}
      section="halo"
      summary={
        on && risk
          ? tiles("wontScanHere")
          : halo
            ? `${percent(halo.width)}%`
            : t("off")
      }
      title={t("halo")}
    >
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm" htmlFor="halo-on">
          {t("showAHalo")}
        </Label>
        {/* Off is always one click away; on only where it can be drawn */}
        <Switch
          {...haloSwitch(style)}
          id="halo-on"
          onCheckedChange={(next) => onChange(next ? {} : undefined)}
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
          {/* The engine draws the rim opaque (qrdx resolveHalo) */}
          <GradientPicker
            alpha={false}
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
