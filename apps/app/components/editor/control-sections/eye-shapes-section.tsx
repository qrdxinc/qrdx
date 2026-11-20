"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { RefreshLeftSquare } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { EYE_POSITIONS, type EyePosition } from "qrdx/types";
import * as React from "react";
import ControlSection from "@/components/editor/control-section";
import { EyePatterns } from "@/components/icons/eye-patterns";
import { EyeDotPatterns } from "@/components/icons/internal-eye-patterns";
import { patterns as eyeDotPatterns } from "@/components/playground/corner-eye-dot-pattern-selector";
import { patterns as eyePatterns } from "@/components/playground/corner-eye-pattern-selector";
import type { QRStyle } from "@/types/theme";
import {
  eyeShapeAt,
  eyeShapeBlocked,
  eyeShapeRisk,
  hasEyeShapes,
  withEyeShape,
} from "./eye-shapes";
import { NewLookTag } from "./new-look-tag";
import { ShapePicker } from "./option-tiles";
import { eyeName } from "./pattern-controls";
import {
  EYE_CATEGORY,
  EYE_DOT_CATEGORY,
  EYE_DOT_FEATURED,
  EYE_FEATURED,
} from "./shape-catalog";

const fill = "size-full text-black [&>svg]:size-full";

interface EyeShapesSectionProps {
  /** The style with defaults filled in */
  style: QRStyle;
  onChange: (eyeShapes: QRStyle["eyeShapes"]) => void;
  /** Open it (a link asked for this section) */
  expanded?: boolean;
}

/**
 * Per-eye shapes: each corner eye's frame and centre can differ from the
 * Eyes shapes. One eye at a time (a row of three), with the same pickers
 * the Eyes section uses; a pick is judged for that eye alone, so a shape
 * that scans badly with the dots or with the eye's other part says so.
 */
export function EyeShapesSection({
  style,
  onChange,
  expanded,
}: EyeShapesSectionProps) {
  const t = useTranslations("editor.controlSections.eyeShapesSection");
  const [position, setPosition] = React.useState<EyePosition>("topLeft");
  const custom = hasEyeShapes(style);
  const current = eyeShapeAt(style, position);

  return (
    <ControlSection
      badge={<NewLookTag id="eye-shapes" />}
      expanded={expanded}
      popover
      section="eye-shapes"
      summary={
        custom
          ? EYE_POSITIONS.filter((eye) => style.eyeShapes?.[eye])
              .map((eye) => eyeName(eyeShapeAt(style, eye).outer))
              .join(" · ")
          : t("sameForAll")
      }
      title={t("eyeShapes")}
    >
      <p className="text-muted-foreground text-xs text-pretty">
        {t("giveEachCornerEyeIts")}
      </p>
      <div
        aria-label={t("whichEye")}
        className="grid grid-cols-3 gap-1 rounded-lg border p-1"
        role="tablist"
      >
        {EYE_POSITIONS.map((eye) => (
          <button
            aria-selected={eye === position}
            className={cn(
              "rounded-md px-2 py-1.5 text-xs transition-colors",
              eye === position
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-accent/40",
            )}
            key={eye}
            onClick={() => setPosition(eye)}
            role="tab"
            type="button"
          >
            {t(`positions.${eye}`)}
            {style.eyeShapes?.[eye] && (
              <span aria-hidden className="ml-1 opacity-70">
                •
              </span>
            )}
          </button>
        ))}
      </div>
      <ShapePicker
        blockedOf={(id) => eyeShapeBlocked(style, position, "outer", id)}
        category={(id) => EYE_CATEGORY[id] ?? "decorative"}
        featured={EYE_FEATURED}
        label={t("frame")}
        noun={t("frameShapes")}
        onChange={(id) =>
          onChange(withEyeShape(style.eyeShapes, position, "outer", id))
        }
        options={eyePatterns}
        preview={(id) => (
          <span className={fill}>
            <EyePatterns pattern={id} />
          </span>
        )}
        riskOf={(id) => eyeShapeRisk(style, position, "outer", id)}
        value={current.outer}
      />
      <ShapePicker
        blockedOf={(id) => eyeShapeBlocked(style, position, "inner", id)}
        category={(id) => EYE_DOT_CATEGORY[id] ?? "decorative"}
        featured={EYE_DOT_FEATURED}
        label={t("center")}
        noun={t("centerShapes")}
        onChange={(id) =>
          onChange(withEyeShape(style.eyeShapes, position, "inner", id))
        }
        options={eyeDotPatterns}
        preview={(id) => (
          <span className={fill}>
            <EyeDotPatterns pattern={id} />
          </span>
        )}
        riskOf={(id) => eyeShapeRisk(style, position, "inner", id)}
        value={current.inner}
      />
      {custom && (
        <Button
          onClick={() => onChange(undefined)}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshLeftSquare />
          {t("useTheSameShapesFor")}
        </Button>
      )}
    </ControlSection>
  );
}
