"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import { RefreshLeftSquare } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import {
  type ColorConfig,
  EYE_POSITIONS,
  type EyeColorOverride,
  type EyePosition,
  getColorString,
  isGradient,
} from "qrdx/types";
import { useId, useState } from "react";
import ControlSection from "@/components/editor/control-section";
import {
  GradientPicker,
  QR_IMAGE_KINDS,
} from "@/components/editor/gradient-picker";
import type { QRStyle } from "@/types/theme";
import {
  EYE_GRADIENT_CONTROL,
  eyeInnerColor,
  eyeOuterColor,
  hasEyeColors,
  hasOwnEyeColor,
  withEyeColor,
} from "./eye-colors";
import { EyeTabs } from "./eye-tabs";
import { NewLookTag } from "./new-look-tag";

interface EyeColorsSectionProps {
  /** The style with defaults filled in */
  style: QRStyle;
  onChange: (eyeColors: QRStyle["eyeColors"]) => void;
  /** Where the eyes' gradients run (qrdx `eyeGradient`); shown with a gradient on an eye */
  onEyeGradientChange?: (eyeGradient: QRStyle["eyeGradient"]) => void;
  /** Open it (a link asked for this section) */
  expanded?: boolean;
}

/** True when any eye is painted with a gradient (the span switch matters). */
export function hasEyeGradient(style: Partial<QRStyle>): boolean {
  const paints = [
    style.eyeColor,
    style.dotColor,
    ...EYE_POSITIONS.flatMap((position) => [
      style.eyeColors?.[position]?.outer,
      style.eyeColors?.[position]?.inner,
    ]),
  ];
  return paints.some((paint) => paint !== undefined && isGradient(paint));
}

/**
 * "Eyes continue the code's gradient" (qrdx `eyeGradient`), shown while an
 * eye is painted with a gradient: the Eye colors section and the preview's
 * eye color menus.
 */
export function EyeGradientControl({
  style,
  onChange,
}: {
  /** The style with defaults filled in */
  style: Partial<QRStyle>;
  onChange: (eyeGradient: QRStyle["eyeGradient"]) => void;
}) {
  const t = useTranslations("editor.controlSections.eyeColorsSection");
  const id = useId();
  if (!hasEyeGradient(style)) return null;
  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm" htmlFor={id}>
          {t("eyesContinueTheCodes")}
          <NewLookTag className="ml-1.5" id={EYE_GRADIENT_CONTROL} />
        </Label>
        <Switch
          checked={style.eyeGradient === "code"}
          id={id}
          onCheckedChange={(on) => onChange(on ? "code" : undefined)}
        />
      </div>
      <p className="text-muted-foreground text-xs text-pretty">
        {t("offEachEyeSweeps")}
      </p>
    </div>
  );
}

/** Takes every eye back to the Eyes and Dots colors. */
export function SameEyeColorsButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("editor.controlSections.eyeColorsSection");
  return (
    <Button onClick={onClick} size="sm" type="button" variant="outline">
      <RefreshLeftSquare />
      {t("useTheSameColorsFor")}
    </Button>
  );
}

/**
 * Per-eye colors: each corner eye's frame and center can differ from the
 * Eyes and Dots colors. One eye at a time (EyeTabs, as in Eye shapes); an
 * eye without its own color shows the colors it is drawn in.
 */
export function EyeColorsSection({
  style,
  onChange,
  onEyeGradientChange,
  expanded,
}: EyeColorsSectionProps) {
  const t = useTranslations("editor.controlSections.eyeColorsSection");
  const [position, setPosition] = useState<EyePosition>("topLeft");
  const custom = hasEyeColors(style);

  const setEye = (part: keyof EyeColorOverride, color: ColorConfig) => {
    onChange(withEyeColor(style.eyeColors, position, part, color));
  };

  return (
    <ControlSection
      expanded={expanded}
      popover
      section="eye-colors"
      summary={
        custom ? (
          <span className="flex -space-x-1">
            {EYE_POSITIONS.map((eye) => {
              const color = eyeOuterColor(style, eye);
              return (
                <span
                  className="ring-background size-3.5 rounded-full border ring-2"
                  key={eye}
                  style={{
                    background: color ? getColorString(color) : undefined,
                  }}
                />
              );
            })}
          </span>
        ) : (
          t("sameForAll")
        )
      }
      title={t("eyeColors")}
    >
      <p className="text-muted-foreground text-xs text-pretty">
        {t("eyesYouLeaveAlone")}
      </p>
      <EyeTabs
        marked={(eye) => hasOwnEyeColor(style, eye)}
        onChange={setPosition}
        value={position}
      >
        {/* Keyed by eye: a picker never carries one eye's state to another */}
        <div className="grid grid-cols-2 gap-2" key={position}>
          <GradientPicker
            kinds={QR_IMAGE_KINDS}
            label={t("frame")}
            name={`eyeColors.${position}.outer`}
            onChange={(color) => setEye("outer", color)}
            value={eyeOuterColor(style, position)}
          />
          <GradientPicker
            kinds={QR_IMAGE_KINDS}
            label={t("center")}
            name={`eyeColors.${position}.inner`}
            onChange={(color) => setEye("inner", color)}
            value={eyeInnerColor(style, position)}
          />
        </div>
      </EyeTabs>
      {custom && <SameEyeColorsButton onClick={() => onChange(undefined)} />}
      {onEyeGradientChange && (
        <EyeGradientControl onChange={onEyeGradientChange} style={style} />
      )}
    </ControlSection>
  );
}
