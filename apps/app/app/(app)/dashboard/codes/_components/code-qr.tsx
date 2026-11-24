"use client";

import { track } from "@repo/analytics";
import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { cn } from "@repo/design-system/lib/utils";
import { Import as Download } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import {
  DOWNLOAD_FORMATS,
  downloadQRCode,
  GIFScanError,
  getQRData,
  QRCode,
} from "qrdx";
import { useState } from "react";
import { markSpotlightSeen } from "@/actions/spotlights";
import { storedStyleDefaults } from "@/config/qr";
import { downloadLookProps } from "@/lib/analytics/download-look";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { styleEngineOptions } from "@/lib/qr-design/engine-options";
import { soundEvent } from "@/lib/sound/emit";
import type { ThemeStyles } from "@/types/theme";

const DOWNLOAD_SIZE = 1024;

/**
 * The files a saved code downloads as; WebP is lossless, BMP an uncompressed
 * 24-bit bitmap (a transparent background comes out white), ICO a favicon
 * with the code at 16, 32, 48 and 256 px, GIF holds at most 256 colors (a
 * design that would stop scanning when reduced to them is refused).
 */
export type CodeImageFormat =
  | "png"
  | "webp"
  | "gif"
  | "bmp"
  | "ico"
  | "tiff"
  | "tiff-cmyk"
  | "svg";
const FORMATS: CodeImageFormat[] = ["png", "webp", "svg"];
/** Formats beyond the buttons, in a "More" menu. */
const MORE_FORMATS: CodeImageFormat[] = [
  "gif",
  "bmp",
  "ico",
  "tiff",
  "tiff-cmyk",
];
const FORMAT_LABELS: Record<CodeImageFormat, string> = {
  png: "PNG",
  webp: "WebP",
  gif: "GIF",
  bmp: "BMP",
  ico: "ICO",
  tiff: "TIFF",
  "tiff-cmyk": "CMYK TIFF",
  svg: "SVG",
};

const resolveStyle = (style: ThemeStyles | null | undefined): ThemeStyles =>
  style ?? storedStyleDefaults;

/** The code's saved design rendered with its short link. */
export function CodeQr({
  value,
  style,
  className,
}: {
  value: string;
  style: ThemeStyles | null | undefined;
  className?: string;
}) {
  const s = resolveStyle(style);
  return (
    <div
      className={cn(
        "flex aspect-square items-center justify-center [&_svg]:size-full",
        className,
      )}
    >
      <QRCode
        bgColor={s.bgColor}
        bodyPattern={s.bodyPattern}
        cornerEyeDotPattern={s.cornerEyeDotPattern}
        cornerEyePattern={s.cornerEyePattern}
        dotColor={s.dotColor}
        eyeColor={s.eyeColor}
        fgColor={s.fgColor}
        hideLogo={!s.showLogo}
        level={s.level}
        frame={s.frame}
        logo={s.customLogo ?? DEFAULT_QR_LOGO}
        margin={s.margin}
        value={value}
        {...styleEngineOptions(s, value)}
      />
    </div>
  );
}

export async function downloadCodeQr(
  code: { slug: string; shortLink: string; style: ThemeStyles | null },
  format: CodeImageFormat,
): Promise<void> {
  const s = resolveStyle(code.style);
  await downloadQRCode(
    {
      ...getQRData({
        value: code.shortLink,
        fgColor: s.fgColor,
        bgColor: s.bgColor,
        eyeColor: s.eyeColor,
        dotColor: s.dotColor,
        bodyPattern: s.bodyPattern,
        hideLogo: !s.showLogo,
        logo: s.customLogo ?? DEFAULT_QR_LOGO,
        margin: s.margin,
        level: s.level,
        ...styleEngineOptions(s, code.shortLink),
      }),
      level: s.level,
      cornerEyePattern: s.cornerEyePattern,
      cornerEyeDotPattern: s.cornerEyeDotPattern,
      frame: s.frame,
    },
    {
      format,
      size: { width: DOWNLOAD_SIZE, height: DOWNLOAD_SIZE },
      filename: `qrdx-${code.slug}${DOWNLOAD_FORMATS[format].nameSuffix ?? ""}.${DOWNLOAD_FORMATS[format].extension}`,
    },
  );
  soundEvent("download");
  // Home's first steps: "Download it for print" is done (first-steps-card.tsx).
  markSpotlightSeen("first-download").catch(() => undefined);
  track("qr_downloaded", {
    format,
    source: "dashboard",
    content_type: "dynamic",
    // A saved code downloads without art (see the props above)
    ...downloadLookProps({ ...s, art: undefined }),
  });
}

export function CodeDownloadButtons({
  code,
  className,
}: {
  code: { slug: string; shortLink: string; style: ThemeStyles | null };
  className?: string;
}) {
  const t = useTranslations("app.dashboard.codes.codeQr");
  const [pending, setPending] = useState<CodeImageFormat | null>(null);

  const download = async (format: CodeImageFormat) => {
    setPending(format);
    try {
      await downloadCodeQr(code, format);
    } catch (error) {
      // Trying again can't help a GIF the palette would break: say why
      toast.error(
        error instanceof GIFScanError
          ? t("gifWouldNotScan")
          : t("downloadFailedPleaseTryAgain"),
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <div className={cn("flex gap-2", className)}>
      {FORMATS.map((format) => (
        <Button
          className="flex-1"
          disabled={pending !== null}
          key={format}
          onClick={() => download(format)}
          size="sm"
          variant="outline"
        >
          <Download />
          {FORMAT_LABELS[format]}
        </Button>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button disabled={pending !== null} size="sm" variant="outline">
            {t("moreFormats")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {MORE_FORMATS.map((format) => (
            <DropdownMenuItem key={format} onSelect={() => download(format)}>
              <Download />
              {FORMAT_LABELS[format]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
