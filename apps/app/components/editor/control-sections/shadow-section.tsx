"use client";

import { Label } from "@repo/design-system/components/ui/label";
import { Slider } from "@repo/design-system/components/ui/slider";
import { Switch } from "@repo/design-system/components/ui/switch";
import { useTranslations } from "next-intl";
import { getSolidColor, resolveShadow } from "qrdx";
import {
  SHADOW_COLOR_DEFAULT,
  SHADOW_OFFSET_MAX,
  SHADOW_OPACITY_MAX,
  SHADOW_OPACITY_MIN,
} from "qrdx/types";
import ControlSection from "@/components/editor/control-section";
import { GradientPicker } from "@/components/editor/gradient-picker";
import type { QRStyle } from "@/types/theme";
import { NewLookTag } from "./new-look-tag";

const percent = (share: number) => Math.round(share * 100);

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
  const shadow = resolveShadow(style.shadow);
  const on = shadow !== null;
  const set = (change: NonNullable<QRStyle["shadow"]>) =>
    onChange({ ...style.shadow, ...change });

  return (
    <ControlSection
      badge={<NewLookTag id="shadow" />}
      expanded={expanded}
      section="shadow"
      summary={on ? `${percent(shadow.opacity)}%` : t("off")}
      title={t("shadow")}
    >
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm" htmlFor="shadow-on">
          {t("showAShadow")}
        </Label>
        <Switch
          checked={on}
          id="shadow-on"
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
    </ControlSection>
  );
}
