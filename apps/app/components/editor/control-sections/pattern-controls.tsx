"use client";

import { CANONICAL_ORIGIN } from "@repo/config";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowDown2 } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrdx";
import type {
  BodyPattern,
  CornerEyeDotPattern,
  CornerEyePattern,
  ErrorLevel,
} from "qrdx/types";
import { useEffect, useId, useState } from "react";
import { useEditableStyle } from "@/components/editor/style-scope";
import { BodyPatterns } from "@/components/icons/body-patterns";
import { EyePatterns } from "@/components/icons/eye-patterns";
import { EyeDotPatterns } from "@/components/icons/internal-eye-patterns";
import { patterns as eyeDotPatterns } from "@/components/playground/corner-eye-dot-pattern-selector";
import { patterns as eyePatterns } from "@/components/playground/corner-eye-pattern-selector";
import { patterns as bodyPatterns } from "@/components/playground/pattern-selector";
import { soundEvent } from "@/lib/sound/emit";
import { isNewIn, type NewBatch } from "@/lib/whats-new";
import {
  NEW_BODY_PATTERNS,
  NEW_EYE_CENTRES,
  NEW_EYE_FRAMES,
} from "@/lib/whats-new/patterns";
import type { QRStyle } from "@/types/theme";
import { OptionGrid, OptionTile, ShapePicker } from "./option-tiles";
import { pairBlocked, pairRisk } from "./pair-rules";
import {
  BODY_CATEGORY,
  BODY_FEATURED,
  EYE_CATEGORY,
  EYE_DOT_CATEGORY,
  EYE_DOT_FEATURED,
  EYE_FEATURED,
  EYE_PRESET_FEATURED,
  EYE_PRESETS,
} from "./shape-catalog";

/** The top-left finder drawn by the real renderer: outer and centre together. */
function EyePairSwatch({
  outer,
  centre,
}: {
  outer: CornerEyePattern;
  centre: CornerEyeDotPattern;
}) {
  return (
    <svg
      aria-hidden="true"
      className="size-full"
      viewBox="-5 -5 80 80"
      xmlns="http://www.w3.org/2000/svg"
    >
      <QRCodeSVG
        bgColor="transparent"
        bodyPattern="square"
        cornerEyeDotPattern={centre}
        cornerEyePattern={outer}
        dotColor="#000000"
        eyeColor="#000000"
        fgColor="#000000"
        level="L"
        margin={0}
        size={210}
        value={CANONICAL_ORIGIN}
      />
    </svg>
  );
}

const fill = "size-full text-black [&>svg]:size-full";

/**
 * Whether an option is new, decided after mount: the server render and the
 * first client render then agree (no tag), and the tags appear with the
 * date the visitor's clock gives.
 */
function useNewOf(batches: readonly NewBatch[]) {
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => setToday(new Date()), []);
  return (id: string) => (today ? isNewIn(batches, id, today) : false);
}

/** The design being edited (the playground's, or a scope's; see style-scope.tsx). */
function useStyleSetter() {
  const { style, setStyle } = useEditableStyle();
  const set = <K extends keyof QRStyle>(key: K, value: QRStyle[K]) => {
    setStyle({ ...style, [key]: value });
    soundEvent("tick");
  };
  return { style, setStyle, set };
}

export const ERROR_LEVELS: Array<{
  id: ErrorLevel;
  name: string;
  recovery: string;
}> = [
  { id: "L", name: "Low", recovery: "7%" },
  { id: "M", name: "Medium", recovery: "15%" },
  { id: "Q", name: "Quartile", recovery: "25%" },
  { id: "H", name: "High", recovery: "30%" },
];

/** Names shown in collapsed section headers. */
export function patternName(id: string | undefined) {
  return bodyPatterns.find((pattern) => pattern.id === id)?.name ?? "Circle";
}

export function eyeName(id: string | undefined) {
  return eyePatterns.find((pattern) => pattern.id === id)?.name ?? "Square";
}

export function eyeDotName(id: string | undefined) {
  return eyeDotPatterns.find((pattern) => pattern.id === id)?.name ?? "Square";
}

/** Collapsed Eyes header: the pair's name, or "Outer · Centre" when custom. */
export function eyeSummary(
  outer: string | undefined,
  centre: string | undefined,
) {
  const preset = EYE_PRESETS.find(
    (item) => item.outer === outer && item.centre === centre,
  );
  return preset ? preset.name : `${eyeName(outer)} · ${eyeDotName(centre)}`;
}

export function DotPatternControl() {
  const t = useTranslations("editor.controlSections.patternControls");
  const { style, set } = useStyleSetter();
  const selected = (style.bodyPattern || "circle") as BodyPattern;
  const newBody = useNewOf(NEW_BODY_PATTERNS);
  return (
    <ShapePicker
      category={(id) => BODY_CATEGORY[id] ?? "decorative"}
      featured={BODY_FEATURED}
      label={t("dotShape")}
      noun={t("dotShapes")}
      onChange={(id) => set("bodyPattern", id)}
      options={bodyPatterns}
      preview={(id) => (
        <span className={fill}>
          <BodyPatterns pattern={id} />
        </span>
      )}
      blockedOf={(id) => pairBlocked(style, { bodyPattern: id })}
      newOf={newBody}
      riskOf={(id) => pairRisk(style, { bodyPattern: id })}
      value={selected}
    />
  );
}

/**
 * Eyes: matching outer + centre pairs as one choice (what most people want),
 * with the two shapes on their own behind "Customize outer and center".
 */
export function EyeControls() {
  const t = useTranslations("editor.controlSections.patternControls");
  const { style, setStyle } = useStyleSetter();
  const outer = (style.cornerEyePattern || "square") as CornerEyePattern;
  const centre = (style.cornerEyeDotPattern || "circle") as CornerEyeDotPattern;
  const preset = EYE_PRESETS.find(
    (item) => item.outer === outer && item.centre === centre,
  );
  const [custom, setCustom] = useState(false);
  const customId = useId();
  const newEye = useNewOf(NEW_EYE_FRAMES);

  return (
    <div className="space-y-4">
      <ShapePicker
        category={(id) => {
          const item = EYE_PRESETS.find((entry) => entry.id === id);
          return (item && EYE_CATEGORY[item.outer]) ?? "decorative";
        }}
        featured={EYE_PRESET_FEATURED}
        label={t("eyeStyle")}
        noun={t("eyeStyles")}
        onChange={(id) => {
          const item = EYE_PRESETS.find((entry) => entry.id === id);
          if (!item) return;
          setStyle({
            ...style,
            cornerEyePattern: item.outer,
            cornerEyeDotPattern: item.centre,
          });
          soundEvent("tick");
        }}
        options={EYE_PRESETS}
        preview={(id) => {
          const item = EYE_PRESETS.find((entry) => entry.id === id);
          return item ? (
            <EyePairSwatch centre={item.centre} outer={item.outer} />
          ) : null;
        }}
        blockedOf={(id) => {
          const item = EYE_PRESETS.find((entry) => entry.id === id);
          return item
            ? pairBlocked(style, {
                cornerEyePattern: item.outer,
                cornerEyeDotPattern: item.centre,
              })
            : false;
        }}
        newOf={(id) => {
          const item = EYE_PRESETS.find((entry) => entry.id === id);
          return item ? newEye(item.outer) : false;
        }}
        riskOf={(id) => {
          const item = EYE_PRESETS.find((entry) => entry.id === id);
          return item
            ? pairRisk(style, {
                cornerEyePattern: item.outer,
                cornerEyeDotPattern: item.centre,
              })
            : null;
        }}
        // A custom pair keeps "Square" in the row unselected.
        value={preset?.id ?? ""}
      />

      <div className="rounded-lg border">
        <button
          aria-controls={customId}
          aria-expanded={custom}
          className="hover:bg-accent/30 focus-visible:ring-ring/40 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium outline-none focus-visible:ring-[3px]"
          onClick={() => setCustom((open) => !open)}
          type="button"
        >
          <span>{t("customizeOuterAndCenter")}</span>
          <span className="text-muted-foreground flex min-w-0 items-center gap-2 font-normal">
            {!preset && (
              <span className="truncate">
                {eyeName(outer)} · {eyeDotName(centre)}
              </span>
            )}
            <ArrowDown2
              aria-hidden
              className={cn(
                "size-3.5 shrink-0 transition-transform duration-200",
                custom && "rotate-180",
              )}
            />
          </span>
        </button>
        {custom && (
          <div className="space-y-4 border-t px-3 pt-3 pb-3" id={customId}>
            <EyeOuterShapeControl />
            <EyeCentreShapeControl />
          </div>
        )}
      </div>
    </div>
  );
}

/** The eyes' outer ring on its own (any centre). */
export function EyeOuterShapeControl() {
  const t = useTranslations("editor.controlSections.patternControls");
  const { style, set } = useStyleSetter();
  const outer = (style.cornerEyePattern || "square") as CornerEyePattern;
  const newEye = useNewOf(NEW_EYE_FRAMES);
  return (
    <ShapePicker
      category={(id) => EYE_CATEGORY[id] ?? "decorative"}
      featured={EYE_FEATURED}
      label={t("outerEyeShape")}
      noun={t("outerShapes")}
      onChange={(id) => set("cornerEyePattern", id)}
      options={eyePatterns}
      preview={(id) => (
        <span className={fill}>
          <EyePatterns pattern={id} />
        </span>
      )}
      blockedOf={(id) => pairBlocked(style, { cornerEyePattern: id })}
      newOf={newEye}
      riskOf={(id) => pairRisk(style, { cornerEyePattern: id })}
      value={outer}
    />
  );
}

/** The eyes' centre on its own (any outer ring). */
export function EyeCentreShapeControl() {
  const t = useTranslations("editor.controlSections.patternControls");
  const { style, set } = useStyleSetter();
  const centre = (style.cornerEyeDotPattern || "circle") as CornerEyeDotPattern;
  const newCentre = useNewOf(NEW_EYE_CENTRES);
  return (
    <ShapePicker
      category={(id) => EYE_DOT_CATEGORY[id] ?? "decorative"}
      featured={EYE_DOT_FEATURED}
      label={t("innerEyeShape")}
      noun={t("centerShapes")}
      onChange={(id) => set("cornerEyeDotPattern", id)}
      options={eyeDotPatterns}
      preview={(id) => (
        <span className={fill}>
          <EyeDotPatterns pattern={id} />
        </span>
      )}
      blockedOf={(id) => pairBlocked(style, { cornerEyeDotPattern: id })}
      newOf={newCentre}
      riskOf={(id) => pairRisk(style, { cornerEyeDotPattern: id })}
      value={centre}
    />
  );
}

export function ErrorLevelControl() {
  const t = useTranslations("editor.controlSections.patternControls");
  const { style, set } = useStyleSetter();
  const selected = style.level || "L";
  return (
    <div className="space-y-3">
      <OptionGrid label={t("errorCorrection")}>
        {ERROR_LEVELS.map((level) => (
          <OptionTile
            hint={level.recovery}
            key={level.id}
            name={level.name}
            onSelect={() => set("level", level.id)}
            selected={selected === level.id}
          >
            <QRCodeSVG
              bgColor="transparent"
              fgColor="#000000"
              level={level.id}
              size={48}
              value={CANONICAL_ORIGIN}
            />
          </OptionTile>
        ))}
      </OptionGrid>
      <p className="text-muted-foreground text-xs text-pretty">
        {t("higherLevelsSurviveScratchesAnd")}
      </p>
    </div>
  );
}
