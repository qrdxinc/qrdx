"use client";

import { Label } from "@repo/design-system/components/ui/label";
import { Slider } from "@repo/design-system/components/ui/slider";
import { Switch } from "@repo/design-system/components/ui/switch";
import { useTranslations } from "next-intl";
import { getBgRadiusLimit, getSolidColor, resolveQRCodeProps } from "qrdx";
import { BG_RADIUS_MAX } from "qrdx/types";
import * as React from "react";
import ControlSection from "@/components/editor/control-section";
import { GradientPicker } from "@/components/editor/gradient-picker";
import { editorCodeProps } from "@/lib/qr-design/props";
import { useQREditorStore } from "@/store/editor-store";
import type { QRStyle } from "@/types/theme";
import { NewLookTag } from "./new-look-tag";

const percent = (share: number) => Math.round(share * 100);
/** Backdrop color when the switch is first turned on. */
const DEFAULT_BACKDROP = "#111111";

interface CornersSectionProps {
  /** The style with defaults filled in */
  style: QRStyle;
  onChange: (change: Pick<QRStyle, "bgRadius" | "backdrop">) => void;
  /** Open it (a link asked for this section) */
  expanded?: boolean;
}

/**
 * The corner radius the slider can offer: the engine caps `bgRadius` so
 * the quiet zone keeps the code's corners (qrdx getBgRadiusLimit), so the
 * range grows with the padding and is 0 without any, or for a shaped code.
 */
export function bgRadiusLimitFor(style: QRStyle, value: string): number {
  // The level the code is really drawn at: the engine holds the logo to its
  // budget, then autoLevel and the logo can raise the level (in that order)
  const props = resolveQRCodeProps(editorCodeProps(style, value));
  return getBgRadiusLimit({
    ...props,
    margin: style.margin,
    shape: style.silhouette ?? style.shape,
  });
}

/** `bgRadiusLimitFor` on the code being edited. */
export function useBgRadiusLimit(style: QRStyle) {
  const value = useQREditorStore((state) => state.value);
  return React.useMemo(
    () => (value.trim() ? bgRadiusLimitFor(style, value) : BG_RADIUS_MAX),
    [value, style],
  );
}

/** The radius shown (percent, capped to what the code allows) and its cap. */
function useCornerRadius(style: QRStyle) {
  const limit = useBgRadiusLimit(style);
  const maxPercent = Math.floor(limit * 100 + 1e-6);
  const shown = Math.min(percent(style.bgRadius ?? 0), maxPercent);
  return { maxPercent, shown };
}

/**
 * Rounded corners on the background (bgRadius), with the color that shows
 * outside them (backdrop, see-through by default).
 */
export function CornersSection({
  style,
  onChange,
  expanded,
}: CornersSectionProps) {
  const t = useTranslations("editor.controlSections.cornersSection");
  const { shown } = useCornerRadius(style);

  return (
    <ControlSection
      badge={<NewLookTag id="corners" />}
      expanded={expanded}
      section="corners"
      summary={shown > 0 ? `${shown}%` : t("square")}
      title={t("roundedCorners")}
    >
      <CornersControl onChange={onChange} style={style} />
    </ControlSection>
  );
}

/**
 * The corner radius slider and Color around it: the Rounded corners
 * section, and the preview's background toolbar.
 */
export function CornersControl({
  style,
  onChange,
}: Omit<CornersSectionProps, "expanded">) {
  const t = useTranslations("editor.controlSections.cornersSection");
  const backdropId = React.useId();
  const { maxPercent, shown } = useCornerRadius(style);
  const rounded = shown > 0;
  const fixed = maxPercent <= 0;

  return (
    <>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("cornerRadius")}</span>
          <span className="tabular-nums">{shown}%</span>
        </div>
        <Slider
          aria-label={t("cornerRadius")}
          disabled={fixed}
          max={fixed ? 1 : maxPercent}
          min={0}
          onValueChange={([next]) => {
            const share = (next ?? 0) / 100;
            onChange({
              bgRadius: share > 0 ? share : undefined,
              backdrop: share > 0 ? style.backdrop : undefined,
            });
          }}
          step={1}
          value={[shown]}
        />
      </div>
      <p className="text-muted-foreground text-xs text-pretty">
        {fixed
          ? style.shape && style.shape !== "square"
            ? t("aShapedCodeHasIts")
            : t("addPaddingToRound")
          : maxPercent < percent(BG_RADIUS_MAX)
            ? t("upToMaxpercentWithThis", { maxPercent })
            : t("roundTheBackgroundsCorners")}
      </p>
      {rounded && (
        <>
          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm" htmlFor={backdropId}>
              {t("colorAroundIt")}
            </Label>
            <Switch
              checked={style.backdrop !== undefined}
              id={backdropId}
              onCheckedChange={(on) =>
                onChange({
                  bgRadius: style.bgRadius,
                  backdrop: on ? DEFAULT_BACKDROP : undefined,
                })
              }
            />
          </div>
          {style.backdrop !== undefined ? (
            <GradientPicker
              kinds={["solid"]}
              label={t("backdrop")}
              name="backdrop"
              onChange={(color) =>
                onChange({
                  bgRadius: style.bgRadius,
                  backdrop: getSolidColor(color, DEFAULT_BACKDROP),
                })
              }
              value={style.backdrop}
            />
          ) : (
            <p className="text-muted-foreground text-xs text-pretty">
              {t("seeThroughOutsideThe")}
            </p>
          )}
        </>
      )}
    </>
  );
}
