"use client";

import { track } from "@repo/analytics";
import { toast } from "@repo/design-system";
import { ModuleOrbit, ScanLine } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Slider } from "@repo/design-system/components/ui/slider";
import { Switch } from "@repo/design-system/components/ui/switch";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/design-system/components/ui/toggle-group";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowDown2,
  TickCircle as CircleCheck,
  CloseCircle as CircleX,
  Import as Download,
  InfoCircle,
  Warning2,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import {
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { BrandLoader } from "@/components/brand-loader";
import { useContentText } from "@/components/i18n/content-text";
import { useBarcodeIssueText } from "@/components/sections/tools/barcode-issue-text";
import {
  useTrackBarcodeGenerated,
  useTrackEditorOpened,
} from "@/lib/analytics/react";
import {
  barcodeColorWarnings,
  type ColorWarning,
  HEX_COLOR,
} from "@/lib/barcode/colors";
import {
  BARCODE_FILES,
  type BarcodeFileType,
  barcodeFileStem,
} from "@/lib/barcode/files";
import {
  BARCODE_FORMATS,
  type BarcodeFormat,
  type BarcodeFormatId,
  type BarcodeIssueCode,
  DEFAULT_BARCODE_FORMAT,
  getBarcodeFormat,
  isBarcodeFormatId,
  isScanCheckable,
  publicationEan13,
  splitBarcodeValue,
  validateBarcodeInput,
} from "@/lib/barcode/formats";
import { canvasToBlob, saveFile, svgToCanvas } from "@/lib/barcode/raster";
import type { RenderedBarcode } from "@/lib/barcode/render";
import type { ScanCheckResult } from "@/lib/barcode/scan-check";
import {
  BARCODE_LIMITS,
  BARCODE_ROTATIONS,
  type BarcodeRotation,
  type BarcodeStyle,
  defaultBarcodeStyle,
  maxQuietZone,
  minScale,
} from "@/lib/barcode/style";
import { soundEvent } from "@/lib/sound/emit";

type RenderModule = typeof import("@/lib/barcode/render");

/** The buttons; the rest are in the More menu. */
const MAIN_FILES: BarcodeFileType[] = ["png", "svg", "pdf"];
const MORE_FILES: BarcodeFileType[] = ["jpg", "webp", "avif", "bmp", "eps"];

/** A valid barcode as the form has it: what a Save button stores. */
export interface CurrentBarcode {
  format: BarcodeFormatId;
  /** The value drawn, check digit included */
  value: string;
  style: BarcodeStyle;
}

export interface BarcodeGeneratorProps {
  /** Start from a saved barcode instead of the EAN-13 example */
  initial?: {
    format: BarcodeFormatId;
    value: string;
    style?: Partial<BarcodeStyle>;
  };
  /** Fields above the barcode type (the dashboard's title) */
  formTop?: ReactNode;
  /** Under the downloads: Save to dashboard, or the editor's Save */
  renderActions?: (current: CurrentBarcode | null) => ReactNode;
  /** The line under the downloads; null for none */
  footnote?: ReactNode;
  /** Where downloads are counted from (analytics) */
  source?: "generator" | "dashboard";
}

const SCAN_CHECK_DELAY_MS = 400;
const LINEAR = BARCODE_FORMATS.filter((format) => format.kind === "linear");
const MATRIX = BARCODE_FORMATS.filter((format) => format.kind === "2d");
/** Problems with the add-on or the sequence variant, shown on their fields */
const ADD_ON_ISSUES = new Set<BarcodeIssueCode>(["addOnDigits", "addOnLength"]);
const VARIANT_ISSUES = new Set<BarcodeIssueCode>([
  "issnVariant",
  "issnEanVariant",
]);

/** The add-on and variant fields `format` has, for validateBarcodeInput. */
const partsFor = (
  format: BarcodeFormat,
  addOn: string,
  variant: string,
): { addOn: string; variant: string } | undefined =>
  format.addOn || format.variant ? { addOn, variant } : undefined;

/** Linear formats that print text rather than a number under the bars */
const TEXT_FORMATS = new Set<BarcodeFormatId>([
  "code128",
  "code39",
  "code93",
  "gs1-128",
  "gs1-databar",
  "gs1-databar-expanded",
]);

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("barcodeTool");
  const id = useId();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const valid = HEX_COLOR.test(text);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <span
          className="relative size-9 shrink-0 overflow-hidden rounded-md border border-border shadow-xs"
          style={{ background: value }}
        >
          <input
            aria-label={t("pickColor", { label })}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </span>
        <Input
          id={id}
          aria-invalid={!valid}
          autoComplete="off"
          className="font-mono uppercase"
          maxLength={7}
          spellCheck={false}
          value={text}
          onChange={(event) => {
            const next = event.target.value.trim();
            const withHash = next.startsWith("#") ? next : `#${next}`;
            setText(withHash);
            if (HEX_COLOR.test(withHash)) onChange(withHash.toLowerCase());
          }}
        />
      </div>
    </div>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  readout,
  onChange,
  children,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  readout: string;
  onChange: (value: number) => void;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label id={id}>{label}</Label>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {readout}
        </span>
      </div>
      <Slider
        aria-labelledby={id}
        max={max}
        min={min}
        step={step}
        value={[value]}
        onValueChange={([next]) => {
          if (next !== undefined) onChange(next);
        }}
      />
      {children}
    </div>
  );
}

function Notice({ warning }: { warning: ColorWarning }) {
  const tc = useContentText();
  return (
    <p
      className={cn(
        "flex gap-2 text-xs leading-snug",
        warning.level === "error" ? "text-destructive" : "text-foreground",
      )}
    >
      <Warning2
        aria-hidden
        className={cn(
          "mt-px size-4 shrink-0",
          warning.level === "error" ? "text-destructive" : "text-amber-500",
        )}
        variant="Bold"
      />
      <span>{tc(warning.message)}</span>
    </p>
  );
}

function ScanStatus({
  checking,
  result,
  label,
  value,
  addOn,
}: {
  checking: boolean;
  result: ScanCheckResult | "unavailable" | null;
  label: string;
  /** What was drawn; readers report some formats differently (UPC-E expanded) */
  value: string;
  /** An ISBN, ISSN or ISMN add-on, which the reader may not report */
  addOn?: string;
}) {
  const t = useTranslations("barcodeTool.scan");
  if (checking || !result) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ScanLine aria-hidden className="size-4" />
        {t("checking")}
      </p>
    );
  }
  if (result === "unavailable") {
    return (
      <p className="flex gap-2 text-xs text-muted-foreground">
        <Warning2 aria-hidden className="mt-px size-4 shrink-0" />
        {t("unavailable")}
      </p>
    );
  }
  // No reader here decodes this format: say so, never "failed".
  if (result.status === "unchecked") {
    return (
      <p className="flex gap-2 text-xs text-muted-foreground">
        <InfoCircle aria-hidden className="mt-px size-4 shrink-0" />
        {t("unchecked", { label })}
      </p>
    );
  }
  if (result.status === "pass") {
    return (
      <p className="flex gap-2 text-xs">
        <CircleCheck
          aria-hidden
          className="mt-px size-4 shrink-0 text-emerald-500"
          variant="Bold"
        />
        <span>
          {t.rich("passed", {
            label,
            value,
            mono: (chunks) => (
              <span className="break-all font-mono">{chunks}</span>
            ),
          })}
          {/* The reader here skips EAN add-ons: say so rather than imply it read one. */}
          {addOn && result.decoded === value ? (
            <span className="mt-0.5 block text-muted-foreground">
              {t("addOnNotChecked", { addOn })}
            </span>
          ) : null}
        </span>
      </p>
    );
  }
  return (
    <p className="flex gap-2 text-xs text-destructive">
      <CircleX aria-hidden className="mt-px size-4 shrink-0" variant="Bold" />
      <span>
        {result.status === "mismatch"
          ? t("mismatch", { decoded: result.decoded, label })
          : t("failed", { label })}
      </span>
    </p>
  );
}

/** Same colors, sizes, text and rotation. */
const sameStyle = (a: BarcodeStyle, b: BarcodeStyle) =>
  a.foreground === b.foreground &&
  a.background === b.background &&
  a.showText === b.showText &&
  a.barHeightMm === b.barHeightMm &&
  a.quietZone === b.quietZone &&
  a.scale === b.scale &&
  (a.rotation ?? 0) === (b.rotation ?? 0);

/**
 * The generator's state: the form's values, the drawing, the scan check and
 * the downloads. Its parts below render it; the /barcode-generator tool, the
 * dashboard's barcode page and the new-barcode modal lay them out their own
 * way. bwip-js (lib/barcode/render.ts) loads through the dynamic import
 * below, and the scan check's decoder loads on first use.
 */
export function useBarcodeGenerator({
  initial,
  source = "generator",
}: Pick<BarcodeGeneratorProps, "initial" | "source"> = {}) {
  const t = useTranslations("barcodeTool");
  const issueText = useBarcodeIssueText();
  const start = useRef({
    format: initial?.format ?? DEFAULT_BARCODE_FORMAT,
    value:
      initial?.value ??
      getBarcodeFormat(initial?.format ?? DEFAULT_BARCODE_FORMAT).example,
    style: {
      ...defaultBarcodeStyle(initial?.format ?? DEFAULT_BARCODE_FORMAT),
      ...initial?.style,
    },
  }).current;
  // ISBN, ISSN and ISMN keep the add-on and variant in fields of their own.
  const startParts = useRef(
    splitBarcodeValue(start.format, start.value),
  ).current;
  const [renderer, setRenderer] = useState<RenderModule | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [formatId, setFormatId] = useState<BarcodeFormatId>(start.format);
  const [input, setInput] = useState<string>(startParts.main);
  const [addOn, setAddOn] = useState(startParts.addOn);
  const [variant, setVariant] = useState(startParts.variant);
  const [foreground, setForeground] = useState(start.style.foreground);
  const [background, setBackground] = useState(start.style.background);
  const [showText, setShowText] = useState(start.style.showText);
  const [barHeightMm, setBarHeightMm] = useState(start.style.barHeightMm);
  const [quietZone, setQuietZone] = useState(start.style.quietZone);
  const [scale, setScale] = useState(start.style.scale);
  const [rotation, setRotation] = useState<BarcodeRotation>(
    start.style.rotation ?? 0,
  );
  const [downloading, setDownloading] = useState<BarcodeFileType | null>(null);
  const [scan, setScan] = useState<ScanCheckResult | "unavailable" | null>(
    null,
  );
  const [checking, setChecking] = useState(false);

  const format = getBarcodeFormat(formatId);
  const linear = format.kind === "linear";
  const inputId = useId();

  useEffect(() => {
    let cancelled = false;
    import("@/lib/barcode/render")
      .then((module) => {
        if (!cancelled) setRenderer(module);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const checked = useMemo(
    () =>
      validateBarcodeInput(
        formatId,
        input,
        partsFor(getBarcodeFormat(formatId), addOn, variant),
      ),
    [formatId, input, addOn, variant],
  );
  /** Everything typed, as one string (the API's form) */
  const typed = [
    input,
    format.variant ? variant : "",
    format.addOn ? addOn : "",
  ]
    .filter(Boolean)
    .join(" ");
  const colorWarnings = useMemo(
    () => barcodeColorWarnings(foreground, background),
    [foreground, background],
  );

  const style = useMemo<BarcodeStyle>(
    () => ({
      foreground,
      background,
      showText,
      barHeightMm,
      quietZone,
      scale,
      rotation,
    }),
    [foreground, background, showText, barHeightMm, quietZone, scale, rotation],
  );

  const drawn = useMemo<
    { rendered: RenderedBarcode } | { error: string } | null
  >(() => {
    if (!(renderer && checked.ok)) return null;
    try {
      return {
        rendered: renderer.renderBarcodeSVG(formatId, checked.value, style),
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : t("drawFailed"),
      };
    }
  }, [renderer, checked, formatId, style, t]);
  const rendered = drawn && "rendered" in drawn ? drawn.rendered : null;
  const value = checked.ok ? checked.value : null;
  const current = useMemo<CurrentBarcode | null>(
    () => (rendered && value ? { format: formatId, value, style } : null),
    [rendered, value, formatId, style],
  );

  // The funnel's first two steps: the public generator opened, and a
  // barcode other than the page's own drawn (never its value).
  useTrackEditorOpened("barcode", source === "generator");
  useTrackBarcodeGenerated({
    source,
    symbology: formatId,
    value: typed,
    rendered: Boolean(rendered),
    initial: { symbology: start.format, value: start.value },
  });

  // Scan check: decode the exact pixels the PNG download would have.
  useEffect(() => {
    if (!(rendered && value)) {
      setScan(null);
      setChecking(false);
      return;
    }
    // A format no reader here decodes: nothing to load or wait for.
    if (!isScanCheckable(formatId)) {
      setScan({ status: "unchecked" });
      setChecking(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const canvas = await svgToCanvas(
          rendered.svg,
          rendered.width,
          rendered.height,
        );
        const { checkBarcodeScan } = await import("@/lib/barcode/scan-check");
        const result = await checkBarcodeScan(canvas, formatId, value);
        if (!cancelled) setScan(result);
      } catch {
        if (!cancelled) setScan("unavailable");
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, SCAN_CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [rendered, value, formatId]);

  const changeFormat = (next: string) => {
    if (!isBarcodeFormatId(next)) return;
    const nextFormat = getBarcodeFormat(next);
    setFormatId(next);
    // Keep what was typed when it's valid for the new format; an untouched
    // example becomes the new format's example.
    if (
      typed === format.example ||
      !validateBarcodeInput(next, input, partsFor(nextFormat, addOn, variant))
        .ok
    ) {
      const example = splitBarcodeValue(next, nextFormat.example);
      setInput(example.main);
      setAddOn(example.addOn);
      setVariant(example.variant);
    }
    setQuietZone(nextFormat.quietZone.default);
    if (nextFormat.barHeightMm) setBarHeightMm(nextFormat.barHeightMm);
    setScale((current) => Math.max(current, minScale(next)));
  };

  /** Back to where it started (the modal's "Create another"). */
  const reset = () => {
    setFormatId(start.format);
    setInput(startParts.main);
    setAddOn(startParts.addOn);
    setVariant(startParts.variant);
    setForeground(start.style.foreground);
    setBackground(start.style.background);
    setShowText(start.style.showText);
    setBarHeightMm(start.style.barHeightMm);
    setQuietZone(start.style.quietZone);
    setScale(start.style.scale);
    setRotation(start.style.rotation ?? 0);
  };

  /** WebP and AVIF: browsers can't encode them, so the image API does. */
  const serverFile = async (type: BarcodeFileType): Promise<Blob> => {
    if (!value) throw new Error(t("fixFirst"));
    const response = await fetch("/api/v1/barcode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: formatId,
        data: value,
        type,
        fg: foreground,
        bg: background,
        scale,
        height: barHeightMm,
        quietZone,
        text: showText,
        rotate: rotation,
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        data?: { details?: { message?: string }[] };
      } | null;
      throw new Error(
        body?.data?.details?.[0]?.message ?? body?.message ?? t("serverFailed"),
      );
    }
    return response.blob();
  };

  const download = async (type: BarcodeFileType) => {
    if (!(rendered && value)) return;
    setDownloading(type);
    const stem = barcodeFileStem(formatId, value);
    const title = `${format.label} barcode`;
    try {
      let blob: Blob;
      if (type === "png" || type === "jpg") {
        const canvas = await svgToCanvas(
          rendered.svg,
          rendered.width,
          rendered.height,
        );
        blob = await canvasToBlob(canvas, BARCODE_FILES[type].mime);
      } else if (type === "bmp") {
        // Canvases can't encode BMP, so the engine writes the PNG's pixels
        // (loaded only when asked for); it checks the bytes are a BMP.
        const [canvas, { canvasToBMP }] = await Promise.all([
          svgToCanvas(rendered.svg, rendered.width, rendered.height),
          import("@/lib/qrdx-lazy/bmp"),
        ]);
        blob = canvasToBMP(canvas);
      } else if (type === "svg") {
        const svg = renderer?.printableSVG(rendered) ?? rendered.svg;
        blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      } else if (type === "pdf") {
        const { barcodePDF } = await import("@/lib/barcode/pdf");
        blob = new Blob([barcodePDF(rendered, { title }) as BlobPart], {
          type: "application/pdf",
        });
      } else if (type === "eps") {
        // The engine's SVG-to-EPS converter; loaded only when asked for.
        const { svgToEPS } = await import("@/lib/qrdx-lazy/eps");
        const eps = await svgToEPS(rendered.svg, {
          width: rendered.widthUnits,
          background,
          title,
        });
        blob = new Blob([eps], { type: "application/postscript" });
      } else {
        blob = await serverFile(type);
      }
      saveFile(blob, `${stem}.${type}`);
      soundEvent("download");
      track("barcode_downloaded", {
        format: type,
        symbology: formatId,
        source,
      });
    } catch (error) {
      soundEvent("error");
      toast.error(t("downloadFailed"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setDownloading(null);
    }
  };

  const error = checked.ok
    ? drawn && "error" in drawn
      ? drawn.error
      : null
    : issueText(checked.issue);

  return {
    inputId,
    format,
    formatId,
    linear,
    input,
    setInput,
    addOn,
    setAddOn,
    variant,
    setVariant,
    changeFormat,
    foreground,
    setForeground,
    background,
    setBackground,
    showText,
    setShowText,
    barHeightMm,
    setBarHeightMm,
    quietZone,
    setQuietZone,
    scale,
    setScale,
    rotation,
    setRotation,
    renderer,
    loadError,
    checked,
    colorWarnings,
    rendered,
    value,
    /** The valid barcode drawn, null while the input has a problem */
    current,
    /** What's wrong with the input or the drawing */
    error,
    scan,
    checking,
    downloading,
    download,
    canDownload: Boolean(rendered) && downloading === null,
    /** Anything differs from where it started */
    changed:
      formatId !== start.format ||
      typed !== start.value ||
      !sameStyle(style, start.style),
    reset,
  };
}

export type BarcodeGeneratorState = ReturnType<typeof useBarcodeGenerator>;

/** The barcode type and what it encodes, with the value's problem or note. */
export function BarcodeContentFields({
  state,
  autoFocus,
}: {
  state: BarcodeGeneratorState;
  /** Focus the value on open (the modal, on wide screens) */
  autoFocus?: boolean;
}) {
  const t = useTranslations("barcodeTool");
  const tc = useContentText();
  const issueText = useBarcodeIssueText();
  const { inputId, format, formatId, linear, input, checked, error } = state;
  // A problem with the add-on or variant marks that field, not the number.
  const partIssue =
    !checked.ok &&
    (ADD_ON_ISSUES.has(checked.issue.code) ||
      VARIANT_ISSUES.has(checked.issue.code));
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${inputId}-format`}>{t("type")}</Label>
        <Select value={formatId} onValueChange={state.changeFormat}>
          <SelectTrigger id={`${inputId}-format`} className="w-full">
            {/* Just the name; the list shows what each one is for. */}
            <SelectValue>{format.label}</SelectValue>
          </SelectTrigger>
          {/* Above the new-barcode modal (z-[99]) too */}
          <SelectContent className="z-[120]">
            <SelectGroup>
              <SelectLabel>{t("linear")}</SelectLabel>
              {LINEAR.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                  <span className="text-muted-foreground">
                    {" "}
                    · {tc(item.summary)}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>2D</SelectLabel>
              {MATRIX.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                  <span className="text-muted-foreground">
                    {" "}
                    · {tc(item.summary)}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={inputId}>
          {t(linear ? "linearInput" : "textInput")}
        </Label>
        {linear ? (
          <Input
            id={inputId}
            aria-describedby={`${inputId}-help`}
            aria-invalid={!checked.ok && !partIssue}
            autoComplete="off"
            autoFocus={autoFocus}
            className="font-mono"
            maxLength={format.maxLength}
            spellCheck={false}
            value={input}
            onChange={(event) => state.setInput(event.target.value)}
          />
        ) : (
          <Textarea
            id={inputId}
            aria-describedby={`${inputId}-help`}
            aria-invalid={!checked.ok}
            autoFocus={autoFocus}
            className="font-mono text-sm"
            maxLength={format.maxLength}
            rows={3}
            spellCheck={false}
            value={input}
            onChange={(event) => state.setInput(event.target.value)}
          />
        )}
        <div id={`${inputId}-help`} className="flex flex-col gap-1">
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : checked.ok && checked.notes ? (
            <p className="text-xs text-foreground">
              {checked.notes.map(issueText).join(" ")}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {tc(format.inputHint)}
          </p>
        </div>
      </div>

      {(format.variant || format.addOn) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {format.variant && (
            <PartField
              hint={tc(format.variant.hint)}
              id={`${inputId}-variant`}
              invalid={!checked.ok && VARIANT_ISSUES.has(checked.issue.code)}
              label={t("variant")}
              maxLength={2}
              placeholder="00"
              value={state.variant}
              onChange={state.setVariant}
            />
          )}
          {format.addOn && (
            <PartField
              hint={tc(format.addOn.hint)}
              id={`${inputId}-addon`}
              invalid={!checked.ok && ADD_ON_ISSUES.has(checked.issue.code)}
              label={t("addOn")}
              maxLength={5}
              value={state.addOn}
              onChange={state.setAddOn}
            />
          )}
        </div>
      )}
    </>
  );
}

/** A short digits field beside the number: an add-on or a sequence variant. */
function PartField({
  id,
  label,
  hint,
  value,
  onChange,
  invalid,
  maxLength,
  placeholder,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  maxLength: number;
  placeholder?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-describedby={`${id}-help`}
        aria-invalid={invalid}
        autoComplete="off"
        className="font-mono"
        inputMode="numeric"
        maxLength={maxLength}
        placeholder={placeholder}
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}

/** Colors, bar height, quiet zone, image size, the text line and rotation. */
export function BarcodeStyleFields({
  state,
}: {
  state: BarcodeGeneratorState;
}) {
  const t = useTranslations("barcodeTool");
  const {
    inputId,
    format,
    formatId,
    linear,
    quietZone,
    barHeightMm,
    scale,
    rendered,
  } = state;
  const quietZoneLow = quietZone < format.quietZone.min;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <ColorField
          label={t("barColor")}
          value={state.foreground}
          onChange={state.setForeground}
        />
        <ColorField
          label={t("background")}
          value={state.background}
          onChange={state.setBackground}
        />
      </div>

      {/* Intelligent Mail's height is set by USPS, so it has no control. */}
      {linear && !format.fixedBarHeightMm && (
        <RangeField
          label={t("barHeight")}
          max={60}
          min={5}
          readout={`${barHeightMm} mm`}
          value={barHeightMm}
          onChange={state.setBarHeightMm}
        />
      )}

      <RangeField
        label={t("quietZone")}
        max={maxQuietZone(formatId)}
        min={0}
        readout={t("modules", { count: quietZone })}
        value={quietZone}
        onChange={state.setQuietZone}
      >
        <p
          className={cn(
            "text-xs",
            quietZoneLow ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {quietZoneLow
            ? t("quietZoneLow", {
                format: format.label,
                min: format.quietZone.min,
                kind: linear ? "linear" : "matrix",
              })
            : t("quietZoneHelp", {
                format: format.label,
                min: format.quietZone.min,
                kind: linear ? "linear" : "matrix",
              })}
        </p>
      </RangeField>

      <RangeField
        label={t("imageSize")}
        max={BARCODE_LIMITS.scale.max}
        min={minScale(formatId)}
        readout={
          rendered
            ? `${Math.round(rendered.width)} × ${Math.round(rendered.height)} px`
            : `${scale}×`
        }
        value={scale}
        onChange={state.setScale}
      />

      {linear && (
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`${inputId}-text`}>
            {t(TEXT_FORMATS.has(format.id) ? "showText" : "showDigits")}
          </Label>
          <Switch
            id={`${inputId}-text`}
            checked={state.showText}
            onCheckedChange={state.setShowText}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <Label id={`${inputId}-rotation`}>{t("rotation")}</Label>
        <ToggleGroup
          aria-labelledby={`${inputId}-rotation`}
          onValueChange={(next) => {
            if (next) state.setRotation(Number(next) as BarcodeRotation);
          }}
          size="sm"
          type="single"
          value={String(state.rotation)}
          variant="outline"
        >
          {BARCODE_ROTATIONS.map((angle) => (
            <ToggleGroupItem
              aria-label={t("degrees", { angle })}
              className="px-2.5 font-mono text-xs tabular-nums"
              key={angle}
              value={String(angle)}
            >
              {angle}°
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </>
  );
}

/** The drawing, as an image: a data URL, so the SVG never becomes page markup. */
function BarcodeImage({
  state,
  className,
}: {
  state: BarcodeGeneratorState;
  className: string;
}) {
  const t = useTranslations("barcodeTool");
  const { rendered } = state;
  if (!rendered) return null;
  return (
    <img
      alt={t("alt", { format: state.format.label, value: state.value ?? "" })}
      className={className}
      height={rendered.height}
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(rendered.svg)}`}
      width={rendered.width}
    />
  );
}

/**
 * The live barcode with its print size, scan check and color warnings.
 * "column" fits the modal's preview column; "compact" is the phone layout,
 * a thumbnail beside the scan check with `action` (e.g. "Design") under it.
 */
export function BarcodePreview({
  state,
  variant = "page",
  action,
}: {
  state: BarcodeGeneratorState;
  variant?: "page" | "column" | "compact";
  action?: ReactNode;
}) {
  const t = useTranslations("barcodeTool");
  const { rendered, renderer, loadError, checked, format, formatId } = state;
  const mm = (units: number, digits = 1) =>
    ((units * 25.4) / 72).toLocaleString("en-US", {
      maximumFractionDigits: digits,
    });
  const drawnValue = state.value ?? "";
  const scanStatus = rendered && (
    <ScanStatus
      addOn={splitBarcodeValue(formatId, drawnValue).addOn || undefined}
      checking={state.checking}
      label={format.label}
      result={state.scan}
      // ISBN, ISSN and ISMN read back as the EAN-13 they're drawn as.
      value={publicationEan13(formatId, drawnValue) ?? drawnValue}
    />
  );

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-3">
        <div
          aria-live="polite"
          className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40 p-1.5"
        >
          {rendered ? (
            <BarcodeImage
              className="h-auto max-h-full w-auto max-w-full"
              state={state}
            />
          ) : !(renderer || loadError) && checked.ok ? (
            <ModuleOrbit aria-hidden className="size-5 text-muted-foreground" />
          ) : (
            <>
              <Warning2 aria-hidden className="size-5 text-muted-foreground" />
              <span className="sr-only">
                {loadError ? t("loadFailed") : t("fixInput")}
              </span>
            </>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          {scanStatus}
          {state.colorWarnings.map((warning) => (
            <Notice key={warning.message} warning={warning} />
          ))}
          {action}
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        aria-live="polite"
        className={cn(
          "flex items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40 p-4",
          variant === "column" ? "min-h-40" : "min-h-56",
        )}
      >
        {rendered ? (
          <BarcodeImage
            className={cn(
              "h-auto w-auto max-w-full",
              variant === "column" ? "max-h-48" : "max-h-80",
            )}
            state={state}
          />
        ) : loadError ? (
          <p className="max-w-xs text-center text-sm text-destructive">
            {t("loadFailed")}
          </p>
        ) : !renderer && checked.ok ? (
          <BrandLoader
            aria-hidden
            className="text-muted-foreground"
            size={24}
          />
        ) : (
          <p className="max-w-xs text-center text-sm text-muted-foreground">
            {t("fixInput")}
          </p>
        )}
      </div>

      {rendered && renderer && (
        <p className="text-xs text-muted-foreground">
          {t("sizes", {
            width: Math.round(rendered.width),
            height: Math.round(rendered.height),
            widthMm: mm(rendered.widthUnits),
            heightMm: mm(rendered.heightUnits),
            moduleMm: mm(
              renderer.MODULE_UNITS[formatId] *
                (getBarcodeFormat(formatId).vectorScale ?? 1),
              2,
            ),
          })}
        </p>
      )}

      {(rendered || state.colorWarnings.length > 0) && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          {scanStatus}
          {state.colorWarnings.map((warning) => (
            <Notice key={warning.message} warning={warning} />
          ))}
        </div>
      )}
    </>
  );
}

/** PNG, SVG and PDF, and the rest in More. */
export function BarcodeDownloads({
  state,
  className,
}: {
  state: BarcodeGeneratorState;
  className?: string;
}) {
  const t = useTranslations("barcodeTool");
  const tc = useContentText();
  const { canDownload, downloading, download } = state;
  return (
    // Two columns on phones: four don't fit a 320 px screen.
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", className)}>
      {MAIN_FILES.map((type) => (
        <Button
          key={type}
          disabled={!canDownload}
          onClick={() => download(type)}
          variant={type === "png" ? "default" : "outline"}
        >
          {downloading === type ? (
            <ModuleOrbit aria-hidden className="size-4" />
          ) : (
            <Download aria-hidden className="size-4" />
          )}
          {BARCODE_FILES[type].label}
        </Button>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button disabled={!canDownload} variant="outline">
            {downloading && MORE_FILES.includes(downloading) ? (
              <ModuleOrbit aria-hidden className="size-4" />
            ) : null}
            {t("more")}
            <ArrowDown2 aria-hidden className="size-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        {/* Above the new-barcode modal (z-[99]) too */}
        <DropdownMenuContent align="end" className="z-[120] w-64">
          <DropdownMenuLabel>{t("moreFormats")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {MORE_FILES.map((type) => (
            <DropdownMenuItem key={type} onSelect={() => download(type)}>
              <span className="w-10 shrink-0 font-medium">
                {BARCODE_FILES[type].label}
              </span>
              <span className="text-muted-foreground text-xs">
                {tc(BARCODE_FILES[type].hint)}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * The /barcode-generator tool: the form beside the barcode, its downloads
 * and `renderActions` (Save) under them. Everything happens in the browser.
 */
export function BarcodeGenerator({
  initial,
  formTop,
  renderActions,
  footnote,
  source = "generator",
}: BarcodeGeneratorProps = {}) {
  const t = useTranslations("barcodeTool");
  const state = useBarcodeGenerator({ initial, source });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
        {formTop}
        <BarcodeContentFields state={state} />
        <BarcodeStyleFields state={state} />
      </div>

      <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <BarcodePreview state={state} />
        <BarcodeDownloads className="mt-auto" state={state} />
        {renderActions?.(state.current)}
        {footnote === null ? null : (
          <p className="text-center text-[11px] text-muted-foreground text-pretty">
            {footnote ?? t("footnote")}
          </p>
        )}
      </div>
    </div>
  );
}
