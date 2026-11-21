"use client";

import { MAX_LOGO_FILE_SIZE } from "@repo/config";
import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import { ArrowRight2, Category, GalleryAdd, Trash } from "iconsax-reactjs";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import * as React from "react";
import type { BrandLogoPick } from "@/components/editor/brand-logos/brand-logo-gallery";
import ControlSection from "@/components/editor/control-section";
import { BRAND_LOGO_COUNT } from "@/lib/brand-logos/catalog.generated";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { soundEvent } from "@/lib/sound/emit";
import type { ThemeStyles } from "@/types/theme";
import { brandLogoName, LogoPresets, logoIconName } from "./logo-presets";
import { OptionGroupLabel } from "./option-tiles";

// The gallery (and the brand index it fetches) loads only when opened.
const BrandLogoGallery = dynamic(
  () =>
    import("@/components/editor/brand-logos/brand-logo-gallery").then(
      (mod) => mod.BrandLogoGallery,
    ),
  { ssr: false },
);

const ALLOWED_LOGO_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
];

/**
 * A logo file picker: `input` is the hidden file input to render, `choose`
 * opens it, `readFile` takes a file from elsewhere (a drop). A PNG, JPG,
 * WebP or SVG within the size limit is read as a data URL (the format logos
 * are saved in) and handed to `onLogo`; anything else gets the same error
 * toasts.
 */
export function useLogoUpload(onLogo: (dataUrl: string) => void) {
  const t = useTranslations("editor.controlSections.logoControls");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Logos are inlined as data URLs into the saved theme and local storage
  const readFile = (file: File): boolean => {
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      toast.error(t("unsupportedLogoFormat"), {
        description: t("useAPngJpgWebp"),
      });
      return false;
    }

    if (file.size > MAX_LOGO_FILE_SIZE) {
      toast.error(t("logoIsTooLarge"), {
        description: t("logosMustBeValueMb", {
          value: MAX_LOGO_FILE_SIZE / 1024 / 1024,
        }),
      });
      return false;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onLogo(reader.result);
        soundEvent("apply");
      }
    };
    reader.onerror = () => {
      toast.error(t("failedToReadLogoFile"));
    };
    reader.readAsDataURL(file);
    return true;
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!readFile(file)) e.target.value = "";
  };

  const input = (
    <input
      accept={ALLOWED_LOGO_TYPES.join(",")}
      aria-label={t("uploadLogo")}
      className="sr-only"
      onChange={onFile}
      ref={fileInputRef}
      tabIndex={-1}
      type="file"
    />
  );

  return {
    input,
    /** Checks and reads a file (a dropped one, say) like a picked one */
    readFile,
    choose: () => fileInputRef.current?.click(),
    clear: () => {
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
  };
}

/** What useLogoUpload gives: the file input, and a way to open it. */
export type LogoUpload = ReturnType<typeof useLogoUpload>;

interface LogoControlsProps {
  style: Partial<ThemeStyles>;
  onStyleChange: (styles: Partial<ThemeStyles>) => void;
  /** Open the section (e.g. when jumping here from the old Settings tab) */
  expanded?: boolean;
}

/**
 * The brand logo gallery: `open` shows it, and picking a brand makes it the
 * logo (with its plate, on a rounded logo). Render `gallery` where it
 * outlives the control that opens it: the Logo section, or beside the
 * preview's toolbar (a menu closes when the dialog takes focus).
 */
export function useBrandLogos(
  style: Partial<ThemeStyles>,
  onStyleChange: (styles: Partial<ThemeStyles>) => void,
) {
  // Mounted on first open, then kept (so it can animate closed).
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  const pick = ({ logo, plate }: BrandLogoPick) => {
    const { plate: _plate, ...options } = style.logoOptions ?? {};
    const logoOptions = plate
      ? { ...options, plate, shape: options.shape ?? "rounded" }
      : options;
    onStyleChange({
      ...style,
      customLogo: logo,
      showLogo: true,
      logoOptions:
        Object.keys(logoOptions).length > 0 ? logoOptions : undefined,
    });
  };

  return {
    open: () => {
      setMounted(true);
      setOpen(true);
    },
    gallery: mounted ? (
      <BrandLogoGallery
        current={style.customLogo}
        hasPlate={Boolean(style.logoOptions?.plate)}
        onOpenChange={setOpen}
        onPick={pick}
        open={open}
      />
    ) : null,
  };
}

export type BrandLogos = ReturnType<typeof useBrandLogos>;

/** The logo's name (the collapsed Logo header, the shown logo's alt text). */
function useLogoName(style: Partial<ThemeStyles>) {
  const t = useTranslations("editor.controlSections.logoControls");
  const iconName = logoIconName(style.customLogo);
  const brandName = brandLogoName(style.customLogo);
  return iconName
    ? t("iconName", { name: iconName })
    : brandName
      ? t("brandName", { name: brandName })
      : style.customLogo
        ? t("yourLogo")
        : t("qrdxLogo");
}

export function LogoControls({
  style,
  onStyleChange,
  expanded,
}: LogoControlsProps) {
  const t = useTranslations("editor.controlSections.logoControls");
  const upload = useLogoUpload((logo) =>
    onStyleChange({ ...style, customLogo: logo, showLogo: true }),
  );
  const brands = useBrandLogos(style, onStyleChange);
  const logoName = useLogoName(style);

  return (
    <ControlSection
      expanded={expanded}
      hint="logo"
      id="section-logo"
      summary={(style.showLogo ?? false) ? logoName : t("off")}
      title={t("logo")}
    >
      {upload.input}
      {brands.gallery}
      <LogoSourceControls
        brands={brands}
        onStyleChange={onStyleChange}
        style={style}
        upload={upload}
      />
    </ControlSection>
  );
}

/**
 * Everything the Logo section holds: the switch, quick icons, brand logos,
 * and the logo shown with Upload, Replace and Remove. The Logo section, the
 * preview's logo toolbar, and its background toolbar while no logo shows.
 * `upload` and `brands` come from the caller, which renders the file input
 * and the gallery where they outlive a menu.
 */
export function LogoSourceControls({
  style,
  onStyleChange,
  upload,
  brands,
}: Omit<LogoControlsProps, "expanded"> & {
  upload: LogoUpload;
  brands: BrandLogos;
}) {
  const t = useTranslations("editor.controlSections.logoControls");
  const switchId = React.useId();
  const showLogo = style.showLogo ?? false;
  const iconName = logoIconName(style.customLogo);
  const brandName = brandLogoName(style.customLogo);
  const logoName = useLogoName(style);
  const brandButtonLabel =
    brandName && showLogo
      ? brandName
      : t("brandCount", { count: BRAND_LOGO_COUNT });
  const handleClearLogo = () => {
    onStyleChange({ ...style, customLogo: undefined });
    upload.clear();
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label className="cursor-pointer text-sm" htmlFor={switchId}>
            {t("logoInTheCenter")}
          </Label>
          <p className="text-muted-foreground text-xs">
            {t("coversAFewDotsError")}
          </p>
        </div>
        <Switch
          checked={showLogo}
          id={switchId}
          onCheckedChange={(value) =>
            onStyleChange({ ...style, showLogo: value })
          }
        />
      </div>

      <div>
        <OptionGroupLabel>{t("quickIcons")}</OptionGroupLabel>
        <LogoPresets
          active={showLogo}
          logo={style.customLogo}
          onPick={(logo) =>
            onStyleChange({ ...style, customLogo: logo, showLogo: true })
          }
          onUpload={upload.choose}
        />
      </div>

      <div>
        <OptionGroupLabel>{t("brandLogos")}</OptionGroupLabel>
        <Button
          aria-haspopup="dialog"
          aria-label={t("brandLogosBrandbuttonlabel", { brandButtonLabel })}
          className="w-full max-w-[17.5rem] justify-start"
          onClick={brands.open}
          type="button"
          variant="outline"
        >
          <Category />
          <span className="min-w-0 flex-1 truncate text-left">
            {brandButtonLabel}
          </span>
          <ArrowRight2 className="text-muted-foreground" />
        </Button>
      </div>

      {showLogo && (
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <span
            className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-white p-1.5 ring-1 ring-black/5"
            // On its plate, so a white brand logo shows
            style={
              style.logoOptions?.plate
                ? { background: style.logoOptions.plate }
                : undefined
            }
          >
            <img
              alt={logoName}
              className="max-h-full max-w-full object-contain"
              src={style.customLogo ?? DEFAULT_QR_LOGO}
            />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-muted-foreground text-xs">
              {t("pngJpgWebpOrSvg", {
                value: MAX_LOGO_FILE_SIZE / 1024 / 1024,
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={upload.choose}
                size="sm"
                type="button"
                variant="outline"
              >
                <GalleryAdd />
                {style.customLogo && !iconName && !brandName
                  ? t("replace")
                  : t("uploadYourLogo")}
              </Button>
              {style.customLogo && (
                <Button
                  onClick={handleClearLogo}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash />
                  {t("remove")}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
