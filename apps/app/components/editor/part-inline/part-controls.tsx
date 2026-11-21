"use client";

import { CANONICAL_HOST } from "@repo/config";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Crop,
  DocumentText,
  Element3,
  Eye,
  EyeSlash,
  Gallery,
  GalleryAdd,
  Gps,
  Layer,
  Maximize4,
  Paintbucket,
  PictureFrame,
  RefreshLeftSquare,
  Scan,
  SecuritySafe,
  Shapes,
  Size,
  Sun1,
  TextBlock,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import {
  getQRData,
  isFrameActive,
  QRCodeSVG,
  resolveErrorLevel,
  resolveHalo,
  resolveShadow,
} from "qrdx";
import type { ColorConfig, EyePosition } from "qrdx/types";
import { type ReactNode, useMemo } from "react";
import { defaultThemeState } from "@/config/qr";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { roleOf } from "@/lib/paint/contrast";
import type { DesignSection } from "@/lib/playground-links";
import { styleEngineOptions } from "@/lib/qr-design/engine-options";
import { soundEvent } from "@/lib/sound/emit";
import type { QRStyle } from "@/types/theme";
import { ColorPresets } from "../control-sections/color-presets";
import { CornersControl } from "../control-sections/corners-section";
import { DotSizeControl, dotSize } from "../control-sections/dot-size-section";
import {
  eyeInnerColor,
  eyeOuterColor,
  hasEyeColors,
  withEyeColor,
  withoutEyeColor,
} from "../control-sections/eye-colors";
import {
  EyeGradientControl,
  SameEyeColorsButton,
} from "../control-sections/eye-colors-section";
import { hasEyeShapes, withEyeShape } from "../control-sections/eye-shapes";
import {
  EyeShapeControls,
  SameEyeShapesButton,
} from "../control-sections/eye-shapes-section";
import {
  FrameControls,
  FrameFields,
  FrameStylePicker,
} from "../control-sections/frame-controls";
import {
  FRAME_SHAPE_IDS,
  ShapePreview,
  useShapedCodes,
  withoutShape,
} from "../control-sections/frame-shapes";
import { frameColors } from "../control-sections/frame-specs";
import { backgroundPickerFor, haloRisk } from "../control-sections/halo-rules";
import { HaloControl } from "../control-sections/halo-section";
import {
  type BrandLogos,
  LogoSourceControls,
  type LogoUpload,
  useBrandLogos,
  useLogoUpload,
} from "../control-sections/logo-controls";
import { LogoCropControls } from "../control-sections/logo-crop-controls";
import {
  AutoLevelControl,
  LogoClearSpaceControl,
  LogoPositionControl,
  LogoSizeControl,
  logoOptionsChange,
  useLogoSize,
} from "../control-sections/logo-options-section";
import {
  CompactTile,
  OptionGrid,
  OptionGroupLabel,
} from "../control-sections/option-tiles";
import { PaddingControls } from "../control-sections/padding-controls";
import {
  DotPatternControl,
  ErrorLevelControl,
  EyeControls,
} from "../control-sections/pattern-controls";
import { ShadowControl } from "../control-sections/shadow-section";
import { Swatch } from "../frame-inline/inline-toolbar";
import {
  PaintPanel,
  paintBackground,
  QR_IMAGE_KINDS,
} from "../paint-picker/paint-panel";
import { useEditableStyle, useEditorValue } from "../style-scope";
import { ContentField } from "./content-field";
import { useCloseMenu } from "./part-marks";
import type { PartId } from "./part-targets";

// What each part's toolbar offers (the phone sheet stacks the same items).
// Every menu is the Design tab's own control, rendered again: the same
// component, the same scan rules and "Won't scan here" blocking, and the
// same store path, so each change is one undo step there too and the two
// stay in step. Pickers that edit through useEditableStyle (shapes, frames,
// error correction) write the editor's state directly; the rest get `update`,
// which merges a change the way the Design tab does (part-overlay.tsx).

/** A toolbar item that opens a menu. */
export interface PartMenuItem {
  kind: "menu";
  id: string;
  label: string;
  /** What the toolbar button shows (an icon, maybe a value) */
  trigger: ReactNode;
  /** The menu's size rules */
  className?: string;
  content: ReactNode;
  /** The Design section with these controls: More options opens it */
  section?: DesignSection;
  /** A recently added look (NEW_LOOKS id): the item carries the New tag */
  isNew?: string;
  /** What it holds can't be drawn here (the amber dot, "Won't scan here") */
  risk?: boolean;
}

/** A toolbar item that switches something on or off. */
export interface PartToggleItem {
  kind: "toggle";
  id: string;
  label: string;
  trigger: ReactNode;
  pressed: boolean;
  onToggle: () => void;
}

/** A small two-way switch in the toolbar (All eyes / This eye). */
export interface PartSegmentItem {
  kind: "segment";
  id: string;
  /** Names the pair */
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}

export type PartItem = PartMenuItem | PartToggleItem | PartSegmentItem;

/** The eyes' shapes and colors go to every eye, or to the one being edited. */
export type EyeScope = "all" | "one";

export interface PartItemsContext {
  /** The eye the edit started on (or moved to) */
  eye: EyePosition;
  eyeScope: EyeScope;
  onEyeScope: (scope: EyeScope) => void;
  /** Ends the edit and opens the Content tab with its form */
  onOpenContent: () => void;
}

const icon = "size-4";
const SHAPE_MENU =
  "w-[19rem] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto";
const PAINT_MENU =
  "w-[18.5rem] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto";
const SLIDER_MENU =
  "w-72 max-h-[var(--radix-popover-content-available-height)] overflow-y-auto";
const LIST_MENU =
  "w-80 max-h-[var(--radix-popover-content-available-height)] overflow-y-auto";

/** A color of the code, in the editor's paint picker (fills and contrast check). */
function PaintField({
  name,
  label,
  value,
  fallback,
  onChange,
  kinds = QR_IMAGE_KINDS,
  alpha,
  children,
}: {
  name: "bgColor" | "fgColor" | "eyeColor" | "dotColor";
  label: string;
  value: ColorConfig | undefined;
  fallback: string;
  onChange: (color: ColorConfig) => void;
  /** The fills offered (the Design tab's, for the same color) */
  kinds?: typeof QR_IMAGE_KINDS;
  alpha?: boolean;
  /** Shown under the picker (a note, a reset) */
  children?: ReactNode;
}) {
  return (
    <section aria-label={label} className="space-y-3">
      <PaintPanel
        alpha={alpha}
        fallback={fallback}
        kinds={kinds}
        onChange={onChange}
        role={roleOf(name)}
        value={value}
      />
      {children}
    </section>
  );
}

function paintTrigger(value: ColorConfig | undefined, fallback: string) {
  return (
    <>
      <Paintbucket aria-hidden className={icon} />
      <Swatch color={paintBackground(value, fallback)} />
    </>
  );
}

/** An icon with the value it stands for, when there is one. */
function valueTrigger(glyph: ReactNode, value?: string) {
  return (
    <>
      {glyph}
      {value !== undefined && <span className="tabular-nums">{value}</span>}
    </>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground text-xs text-pretty">{children}</p>
  );
}

const percent = (share: number) => Math.round(share * 100);

/** The level the code is drawn at: a big logo can raise it (autoLevel). */
function drawnErrorLevel(style: QRStyle, value: string) {
  const options = styleEngineOptions(style);
  const data = getQRData({
    value,
    level: style.level,
    margin: style.margin,
    hideLogo: !style.showLogo,
    logo: style.customLogo ?? DEFAULT_QR_LOGO,
    ...options,
  });
  return resolveErrorLevel({
    value: data.value,
    size: data.size,
    level: data.level,
    margin: data.margin,
    imageSettings: data.imageSettings,
    autoLevel: options.autoLevel,
    shape: options.shape,
  });
}

/** Error correction, the logo's automatic raise, and what's drawn. */
function ErrorCorrectionMenu({
  style,
  update,
}: {
  /** The style with defaults filled in */
  style: QRStyle;
  update: (change: Partial<QRStyle>) => void;
}) {
  const t = useTranslations("editor.partInline.errorCorrection");
  const value = useEditorValue();
  const drawn = useMemo(
    () => (value.trim() ? drawnErrorLevel(style, value) : style.level),
    [style, value],
  );
  return (
    <div className="space-y-4">
      <ErrorLevelControl />
      {style.showLogo && <AutoLevelControl onChange={update} style={style} />}
      {drawn && drawn !== style.level && (
        <Note>{t("theLogoRaisesItToLevel", { level: drawn })}</Note>
      )}
    </div>
  );
}

/**
 * The outline the code is drawn in: square, or one of the shaped codes the
 * Frame picker offers (useShapedCodes: the same picks, your own shape's
 * upload, and the rule that a shape takes the place of a frame).
 */
function CodeShapeMenu() {
  const t = useTranslations("editor.partInline.codeShape");
  const { style, setStyle } = useEditableStyle();
  const shapes = useShapedCodes();
  const current = shapes.current ?? "square";
  return (
    <div className="space-y-3">
      <OptionGrid columns={4} label={t("codeShape")}>
        <CompactTile
          name={t("names.square")}
          onSelect={() => {
            soundEvent("tick");
            setStyle(withoutShape(style));
          }}
          selected={current === "square"}
        >
          <QRCodeSVG
            bgColor="#ffffff"
            bodyPattern="square"
            cornerEyeDotPattern="square"
            cornerEyePattern="square"
            fgColor="#000000"
            size={40}
            style={{ maxHeight: "100%", maxWidth: "100%" }}
            value={CANONICAL_HOST}
          />
        </CompactTile>
        {FRAME_SHAPE_IDS.map((id) => (
          <CompactTile
            key={id}
            name={shapes.names[id]}
            onSelect={() => shapes.pick(id)}
            selected={current === id}
          >
            <ShapePreview id={id} silhouette={shapes.silhouette} />
          </CompactTile>
        ))}
      </OptionGrid>
      {shapes.panel}
      <Note>{t("aShapeTakesThePlace")}</Note>
    </div>
  );
}

/** `eyeShapes` without `eye`'s own shapes. */
function withoutEyeShape(
  eyeShapes: QRStyle["eyeShapes"],
  eye: EyePosition,
): QRStyle["eyeShapes"] {
  return withEyeShape(
    withEyeShape(eyeShapes, eye, "outer", undefined),
    eye,
    "inner",
    undefined,
  );
}

/**
 * The Logo section's controls in a toolbar menu: opening the brand gallery
 * closes the menu first (the gallery lives outside it, in the extras).
 */
function LogoMenuControls({
  style,
  logo,
}: {
  style: QRStyle;
  logo: { upload: LogoUpload; brands: BrandLogos; onChange: LogoChange };
}) {
  const closeMenu = useCloseMenu();
  return (
    <LogoSourceControls
      brands={{
        ...logo.brands,
        open: () => {
          closeMenu();
          logo.brands.open();
        },
      }}
      onStyleChange={logo.onChange}
      style={style}
      upload={logo.upload}
    />
  );
}

/** The Logo section as a menu (its file input and gallery live outside it). */
function logoMenu(
  current: QRStyle,
  logo: { upload: LogoUpload; brands: BrandLogos; onChange: LogoChange },
  { id, label, glyph }: { id: string; label: string; glyph: ReactNode },
): PartMenuItem {
  return {
    kind: "menu",
    id,
    label,
    trigger: glyph,
    className: LIST_MENU,
    section: "logo",
    content: (
      <div className="space-y-4">
        <LogoMenuControls logo={logo} style={current} />
      </div>
    ),
  };
}

/** A change from the Logo section's controls: the logo's own fields. */
type LogoChange = (next: Partial<QRStyle>) => void;

/**
 * The items of `part`'s toolbar for `style` (the design as stored, defaults
 * not filled in). `update` merges a change into the design.
 */
export function usePartItems(
  part: PartId,
  style: QRStyle,
  update: (change: Partial<QRStyle>) => void,
  context: PartItemsContext,
): { items: PartItem[]; extra: ReactNode } {
  const t = useTranslations("editor.partInline.items");
  const current: QRStyle = { ...defaultThemeState.styles, ...style };
  const upload = useLogoUpload((logo) =>
    update({ customLogo: logo, showLogo: true }),
  );
  // As the Logo section's onStyleChange (design-controls.tsx): its fields only
  const onLogoChange: LogoChange = (next) =>
    update({
      customLogo: next.customLogo,
      showLogo: next.showLogo,
      logoOptions: next.logoOptions,
    });
  const brands = useBrandLogos(current, onLogoChange);
  const logo = { upload, brands, onChange: onLogoChange };
  // The Upload tile's file input and the brand gallery, outside the menus
  // (a menu closes when its file picker or the gallery takes over)
  const logoExtra = (
    <>
      {upload.input}
      {brands.gallery}
    </>
  );
  // The logo's size as drawn (capped to what the code can repair)
  const logoSize = useLogoSize(current).shown;

  if (part === "eyes") {
    const { eye, eyeScope } = context;
    const one = eyeScope === "one";
    const own = current.eyeColors?.[eye];
    const ownShape = current.eyeShapes?.[eye];
    const outer = one
      ? eyeOuterColor(current, eye)
      : (current.eyeColor ?? current.fgColor);
    const inner = one
      ? eyeInnerColor(current, eye)
      : (current.dotColor ?? outer);
    const sameColors = one ? (
      own?.outer || own?.inner ? (
        <Button
          onClick={() =>
            update({ eyeColors: withoutEyeColor(current.eyeColors, eye) })
          }
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshLeftSquare aria-hidden className={icon} />
          {t("sameAsTheOthers")}
        </Button>
      ) : null
    ) : hasEyeColors(current) ? (
      <>
        <Note>{t("eyesWithTheirOwnColor")}</Note>
        <SameEyeColorsButton onClick={() => update({ eyeColors: undefined })} />
      </>
    ) : null;
    const gradient = (
      <EyeGradientControl
        onChange={(eyeGradient) => update({ eyeGradient })}
        style={current}
      />
    );
    const setColor = (which: "outer" | "inner", color: ColorConfig) =>
      update(
        one
          ? { eyeColors: withEyeColor(current.eyeColors, eye, which, color) }
          : which === "outer"
            ? { eyeColor: color }
            : { dotColor: color },
      );
    return {
      extra: null,
      items: [
        {
          kind: "segment",
          id: "eye-scope",
          label: t("whichEyes"),
          options: [
            { id: "all", label: t("allEyes") },
            { id: "one", label: t("thisEye") },
          ],
          value: eyeScope,
          onChange: (id) => context.onEyeScope(id as EyeScope),
        },
        one
          ? {
              kind: "menu",
              id: "shape",
              label: t("thisEyesShape"),
              trigger: <Scan aria-hidden className={icon} />,
              className: SHAPE_MENU,
              section: "eye-shapes",
              isNew: "eye-shapes",
              content: (
                <>
                  <EyeShapeControls
                    onChange={(eyeShapes) => update({ eyeShapes })}
                    position={eye}
                    style={current}
                  />
                  {ownShape && (
                    <Button
                      onClick={() =>
                        update({
                          eyeShapes: withoutEyeShape(current.eyeShapes, eye),
                        })
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <RefreshLeftSquare aria-hidden className={icon} />
                      {t("sameAsTheOthers")}
                    </Button>
                  )}
                </>
              ),
            }
          : {
              kind: "menu",
              id: "shape",
              label: t("eyeShape"),
              trigger: <Scan aria-hidden className={icon} />,
              className: SHAPE_MENU,
              section: "eyes",
              content: (
                <>
                  <EyeControls customOpen />
                  {hasEyeShapes(current) && (
                    <>
                      <Note>{t("eyesWithTheirOwnShape")}</Note>
                      <SameEyeShapesButton
                        onClick={() => update({ eyeShapes: undefined })}
                      />
                    </>
                  )}
                </>
              ),
            },
        {
          kind: "menu",
          id: "eye-color",
          label: one ? t("thisEyesColor") : t("eyeColor"),
          trigger: paintTrigger(outer, "#000000"),
          className: PAINT_MENU,
          section: one ? "eye-colors" : "colors",
          content: (
            <PaintField
              fallback="#000000"
              label={t("eyeColor")}
              name="eyeColor"
              onChange={(color) => setColor("outer", color)}
              value={outer}
            >
              {sameColors}
              {gradient}
            </PaintField>
          ),
        },
        {
          kind: "menu",
          id: "centre-color",
          label: one ? t("thisEyesCenterColor") : t("centerColor"),
          trigger: paintTrigger(inner, "#000000"),
          className: PAINT_MENU,
          section: one ? "eye-colors" : "colors",
          content: (
            <PaintField
              fallback="#000000"
              label={t("centerColor")}
              name="dotColor"
              onChange={(color) => setColor("inner", color)}
              value={inner}
            >
              {sameColors}
              {gradient}
            </PaintField>
          ),
        },
      ],
    };
  }

  if (part === "dots") {
    const halo = current.halo === undefined ? null : resolveHalo(current.halo);
    const shadow = resolveShadow(current.shadow);
    return {
      extra: null,
      items: [
        {
          kind: "menu",
          id: "pattern",
          label: t("pattern"),
          trigger: <Element3 aria-hidden className={icon} />,
          className: SHAPE_MENU,
          section: "dots",
          content: <DotPatternControl />,
        },
        {
          kind: "menu",
          id: "dot-color",
          label: t("dotColor"),
          trigger: paintTrigger(current.fgColor, "#000000"),
          className: PAINT_MENU,
          section: "colors",
          content: (
            <PaintField
              fallback="#000000"
              label={t("dotColor")}
              name="fgColor"
              onChange={(color) => update({ fgColor: color })}
              value={current.fgColor}
            />
          ),
        },
        {
          kind: "menu",
          id: "dot-size",
          label: t("dotSize"),
          trigger: valueTrigger(
            <Size aria-hidden className={icon} />,
            `${dotSize(current).value}%`,
          ),
          className: SLIDER_MENU,
          section: "dot-size",
          content: (
            <DotSizeControl
              onChange={(moduleScale) => update({ moduleScale })}
              style={current}
            />
          ),
        },
        {
          kind: "menu",
          id: "halo",
          label: t("halo"),
          trigger: valueTrigger(
            <Sun1 aria-hidden className={icon} />,
            halo ? `${percent(halo.width)}%` : undefined,
          ),
          className: SLIDER_MENU,
          section: "halo",
          isNew: "halo",
          risk: halo !== null && haloRisk(current) !== null,
          content: (
            <div className="space-y-4">
              <HaloControl
                onChange={(next) => update({ halo: next })}
                style={current}
              />
            </div>
          ),
        },
        {
          kind: "menu",
          id: "shadow",
          label: t("shadow"),
          trigger: valueTrigger(
            <Layer aria-hidden className={icon} />,
            shadow ? `${percent(shadow.opacity)}%` : undefined,
          ),
          className: SLIDER_MENU,
          section: "shadow",
          isNew: "shadow",
          content: (
            <div className="space-y-4">
              <ShadowControl
                onChange={(next) => update({ shadow: next })}
                style={current}
              />
            </div>
          ),
        },
      ],
    };
  }

  if (part === "logo") {
    const shown = current.showLogo ?? false;
    const setOptions = (change: Parameters<typeof logoOptionsChange>[1]) =>
      update(logoOptionsChange(current.logoOptions ?? {}, change));
    return {
      extra: logoExtra,
      items: [
        logoMenu(current, logo, {
          id: "logo",
          label: t("logo"),
          glyph: <Gallery aria-hidden className={icon} />,
        }),
        {
          kind: "menu",
          id: "logo-size",
          label: t("logoSize"),
          trigger: valueTrigger(
            <Size aria-hidden className={icon} />,
            `${logoSize}%`,
          ),
          className: SLIDER_MENU,
          section: "logo",
          content: (
            <div className="space-y-4">
              <LogoSizeControl onChange={update} style={current} />
              <AutoLevelControl onChange={update} style={current} />
            </div>
          ),
        },
        {
          kind: "menu",
          id: "logo-shape",
          label: t("logoShapeAndPlate"),
          trigger: <Crop aria-hidden className={icon} />,
          className: LIST_MENU,
          section: "logo",
          content: (
            <LogoCropControls
              onChange={update}
              setOptions={setOptions}
              style={current}
            />
          ),
        },
        {
          kind: "menu",
          id: "clear-space",
          label: t("clearSpace"),
          trigger: valueTrigger(
            <Maximize4 aria-hidden className={icon} />,
            String(current.logoOptions?.padding ?? 0),
          ),
          className: SLIDER_MENU,
          section: "logo",
          content: <LogoClearSpaceControl onChange={update} style={current} />,
        },
        {
          kind: "menu",
          id: "logo-position",
          label: t("logoPosition"),
          trigger: <Gps aria-hidden className={icon} />,
          className: SLIDER_MENU,
          section: "logo",
          content: <LogoPositionControl onChange={update} style={current} />,
        },
        {
          kind: "toggle",
          id: "hide-logo",
          label: t("hideLogo"),
          trigger: shown ? (
            <EyeSlash aria-hidden className={icon} />
          ) : (
            <Eye aria-hidden className={icon} />
          ),
          pressed: !shown,
          onToggle: () => update({ showLogo: !shown }),
        },
      ],
    };
  }

  if (part === "background") {
    // No frame drawn (so no frame button): its menu is here
    const noFrame = !isFrameActive(current.frame);
    return {
      // While no logo shows, the logo's menu is here (with its extras)
      extra: current.showLogo ? null : logoExtra,
      items: [
        {
          kind: "menu",
          id: "content",
          label: t("content"),
          trigger: <DocumentText aria-hidden className={icon} />,
          className: "w-80",
          content: <ContentField onOpenContent={context.onOpenContent} />,
        },
        {
          kind: "menu",
          id: "background-color",
          label: t("backgroundColor"),
          trigger: paintTrigger(current.bgColor, "#ffffff"),
          className: PAINT_MENU,
          section: "colors",
          content: (
            <PaintField
              fallback="#ffffff"
              label={t("backgroundColor")}
              name="bgColor"
              onChange={(color) => update({ bgColor: color })}
              value={current.bgColor}
              // While a halo is on, no see-through or picture background
              // (they always refuse it, halo-rules.ts)
              {...backgroundPickerFor(current, QR_IMAGE_KINDS)}
            >
              <div className="border-t pt-3">
                <OptionGroupLabel>{t("palettes")}</OptionGroupLabel>
                <ColorPresets
                  onApply={(colors) => update(colors)}
                  style={current}
                />
              </div>
            </PaintField>
          ),
        },
        {
          kind: "menu",
          id: "padding",
          label: t("paddingAndCorners"),
          trigger: valueTrigger(
            <Maximize4 aria-hidden className={icon} />,
            String(current.margin ?? 0),
          ),
          className: SLIDER_MENU,
          section: "padding",
          isNew: "corners",
          content: (
            <div className="space-y-4">
              <PaddingControls
                onChange={(margin) => update({ margin })}
                value={current.margin}
              />
              <div className="space-y-4 border-t pt-3">
                <OptionGroupLabel>{t("roundedCorners")}</OptionGroupLabel>
                <CornersControl onChange={update} style={current} />
              </div>
            </div>
          ),
        },
        {
          kind: "menu",
          id: "code-shape",
          label: t("codeShape"),
          trigger: <Shapes aria-hidden className={icon} />,
          className: SLIDER_MENU,
          section: "frame",
          content: <CodeShapeMenu />,
        },
        {
          kind: "menu",
          id: "error-correction",
          label: t("errorCorrection"),
          trigger: valueTrigger(
            <SecuritySafe aria-hidden className={icon} />,
            current.level ?? "Q",
          ),
          className: LIST_MENU,
          section: "error-correction",
          content: <ErrorCorrectionMenu style={current} update={update} />,
        },
        ...(current.showLogo
          ? []
          : [
              logoMenu(current, logo, {
                id: "add-logo",
                label: t("logo"),
                glyph: <GalleryAdd aria-hidden className={icon} />,
              }),
            ]),
        ...(noFrame
          ? [
              {
                kind: "menu" as const,
                id: "add-frame",
                label: t("frame"),
                trigger: <PictureFrame aria-hidden className={icon} />,
                className: SHAPE_MENU,
                section: "frame" as const,
                content: <FrameControls />,
              },
            ]
          : []),
      ],
    };
  }

  // The frame
  const frame = current.frame;
  const frameColor = frame ? frameColors(frame).frame : null;
  return {
    extra: null,
    items: [
      {
        kind: "menu",
        id: "frame-style",
        label: t("frameStyle"),
        trigger: <PictureFrame aria-hidden className={icon} />,
        className: SHAPE_MENU,
        section: "frame",
        content: <FrameStylePicker />,
      },
      {
        kind: "menu",
        id: "frame-fields",
        label: t("frameTextAndColors"),
        trigger: (
          <>
            <TextBlock aria-hidden className={icon} />
            {frameColor && <Swatch color={frameColor} />}
          </>
        ),
        className: LIST_MENU,
        section: "frame",
        content: (
          <div className="space-y-4">
            <FrameFields />
          </div>
        ),
      },
    ],
  };
}
