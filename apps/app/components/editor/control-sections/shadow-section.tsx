"use client";

import { Label } from "@repo/design-system/components/ui/label";
import { Slider } from "@repo/design-system/components/ui/slider";
import { Switch } from "@repo/design-system/components/ui/switch";
import { useTranslations } from "next-intl";
import { getSolidColor, resolveShadow } from "qrdx";
import {
  type QRShadow,
  SHADOW_COLOR_DEFAULT,
  SHADOW_OFFSET_DEFAULT,
  SHADOW_OFFSET_MAX,
  SHADOW_OPACITY_DEFAULT,
  SHADOW_OPACITY_MAX,
  SHADOW_OPACITY_MIN,
} from "qrdx/types";
import { useId } from "react";
import ControlSection from "@/components/editor/control-section";
import { GradientPicker } from "@/components/editor/gradient-picker";
import type { QRStyle } from "@/types/theme";
import { NewLookTag } from "./new-look-tag";

const percent = (share: number) => Math.round(share * 100);

const finite = (value: number | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/**
 * The shadow's controls as shown: the style's values with the defaults
 * filled in. A shadow that is on stays on at a shift of 0 (the engine then
 * draws nothing), so dragging a slider through 0 keeps the controls and
 * the other values.
 */
export function shadowValues(shadow: QRShadow): {
  color: string;
  opacity: number;
  dx: number;
  dy: number;
} {
  return {
    color: shadow.color || SHADOW_COLOR_DEFAULT,
    opacity: finite(shadow.opacity, SHADOW_OPACITY_DEFAULT),
    dx: finite(shadow.dx, SHADOW_OFFSET_DEFAULT),
    dy: finite(shadow.dy, SHADOW_OFFSET_DEFAULT),
  };
}

/**
 * The collapsed section's summary: the opacity the engine draws, or `off`
 * when it draws nothing (no shadow, or a shift of 0 both ways).
 */
export function shadowSummary(
  shadow: QRShadow | undefined,
  off: string,
): string {
  const drawn = resolveShadow(shadow);
  return drawn ? `${percent(drawn.opacity)}%` : off;
}

interface ShadowSectionProps {
  /** The style with defaults filled in */
  style: QRStyle;
  onChange: (shadow: QRStyle["shadow"]) => void;
  /** Open it (a link asked for this section) */
  expanded?: boolean;
}

/** A labelled slider row: name on the left, value on the right. */
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{value}%</span>
      </div>
      <Slider
        aria-label={label}
        max={max}
        min={min}
        onValueChange={([next]) => onChange(next ?? value)}
        step={step}
        value={[value]}
      />
    </div>
  );
}

/**
 * A shadow: a see-through copy of the dots and eyes shifted under them
 * (qrdx `shadow`). Shifts and opacity stay in the engine's ranges, where
 * every dot shape still decodes at phone distances.
 */
export function ShadowSection({
  style,
  onChange,
  expanded,
}: ShadowSectionProps) {
  const t = useTranslations("editor.controlSections.shadowSection");

  return (
    <ControlSection
      badge={<NewLookTag id="shadow" />}
      expanded={expanded}
      section="shadow"
      summary={shadowSummary(style.shadow, t("off"))}
      title={t("shadow")}
    >
      <ShadowControl onChange={onChange} style={style} />
    </ControlSection>
  );
}

/**
 * The shadow's switch, shifts, opacity and color: the Shadow section, and
 * the preview's dots toolbar.
 */
export function ShadowControl({
  style,
  onChange,
}: Omit<ShadowSectionProps, "expanded">) {
  const t = useTranslations("editor.controlSections.shadowSection");
  const switchId = useId();
  const shadow = style.shadow ? shadowValues(style.shadow) : null;
  const on = shadow !== null;
  const set = (change: NonNullable<QRStyle["shadow"]>) =>
    onChange({ ...style.shadow, ...change });

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm" htmlFor={switchId}>
          {t("showAShadow")}
        </Label>
        <Switch
          checked={on}
          id={switchId}
          onCheckedChange={(next) => onChange(next ? {} : undefined)}
        />
      </div>
      <p className="text-muted-foreground text-xs text-pretty">
        {t("aSeeThroughCopy")}
      </p>
      {on && (
        <>
          <SliderRow
            label={t("across")}
            max={percent(SHADOW_OFFSET_MAX)}
            min={-percent(SHADOW_OFFSET_MAX)}
            onChange={(next) => set({ dx: next / 100 })}
            step={5}
            value={percent(shadow.dx)}
          />
          <SliderRow
            label={t("down")}
            max={percent(SHADOW_OFFSET_MAX)}
            min={-percent(SHADOW_OFFSET_MAX)}
            onChange={(next) => set({ dy: next / 100 })}
            step={5}
            value={percent(shadow.dy)}
          />
          <SliderRow
            label={t("opacity")}
            max={percent(SHADOW_OPACITY_MAX)}
            min={percent(SHADOW_OPACITY_MIN)}
            onChange={(next) => set({ opacity: next / 100 })}
            step={5}
            value={percent(shadow.opacity)}
          />
          <GradientPicker
            kinds={["solid"]}
            label={t("color")}
            name="shadow.color"
            onChange={(color) =>
              set({ color: getSolidColor(color, SHADOW_COLOR_DEFAULT) })
            }
            value={shadow.color}
          />
        </>
      )}
    </>
  );
}
