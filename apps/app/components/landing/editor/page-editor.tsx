"use client";

import { track } from "@repo/analytics";
import { toast } from "@repo/design-system";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import { cn } from "@repo/design-system/lib/utils";
import {
  Airdrop,
  InfoCircle as AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowDown2 as ChevronDown,
  Copy,
  ExportSquare as ExternalLink,
  Eye,
  EyeSlash as EyeOff,
  Menu as GripVertical,
  ScanBarcode as QrCode,
  Trash as Trash2,
} from "iconsax-reactjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { publishCodeSwitchPage } from "@/actions/code-kind";
import { publishLandingPage } from "@/actions/landing-pages";
import { useShowLimit } from "@/components/limits/limit-dialog";
import { PhoneFrame } from "@/components/mockups/phone-frame";
import { useWorkspaceHref } from "@/components/workspace-provider";
import { ViewOnlyNotice } from "@/components/workspaces/view-only";
import { usePreviewCss } from "@/ee/white-label/editor";
import {
  type BlockEditorContext,
  createBlock,
  getBlock,
  parseLandingPageContent,
} from "@/lib/landing/blocks";
import {
  findSamples,
  removeSamples,
  type SampleItem,
  samplesByBlock,
} from "@/lib/landing/samples";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import type { LandingBlock, LandingPageContent } from "@/types/landing";
import { LandingPageFooter } from "../page-footer";
import {
  DEFAULT_PAGE_SETTINGS,
  getPageSettings,
  PAGE_SETTINGS_TYPE,
  type PageSettings,
} from "../page-settings-block";
import { LandingRender } from "../render";
import { AddBlockMenu } from "./add-block-menu";
import { BrandingSection } from "./branding-section";
import { PagePlanNote } from "./page-plan-line";
import { PageSettingsEditor } from "./page-settings-editor";
import { type SavedThemePalette, ThemeControls } from "./theme-controls";

export interface PageEditorProps {
  page: {
    id: string;
    title: string | null;
    version: number;
    typeLabel: string;
  };
  initialContent: LandingPageContent;
  /** The page's first QR code, null when none is linked */
  code: {
    id: string;
    pageUrl: string;
    shortLink: string;
    /** NFC (feat/nfc): the code's NFC page, for vCard Plus pages */
    nfcHref?: string | null;
    /** Verified custom domain it's served on (GS1 Digital Link for products) */
    customDomain?: string | null;
  } | null;
  savedThemes: SavedThemePalette[];
  canUseCustomCss: boolean;
  /** badge: "Made with QRdx" footer (Free); whiteLabel: Business (ee/white-label) */
  branding: { badge: boolean; whiteLabel: boolean };
  storageEnabled: boolean;
  /**
   * Viewers and billing members (lib/permissions.ts): the published page
   * and its links, without the editor or Publish (the server refuses a
   * publish too).
   */
  readOnly?: boolean;
  /**
   * Changing a printed code's type (codes/[id]/change-type): the page isn't
   * saved yet. Publish makes it and points the code at it in one step;
   * scans keep their current destination until then.
   */
  switchCode?: PageEditorSwitch;
  /**
   * The wording this page type's templates start with
   * (lib/landing/template-samples.ts): unchanged, it's marked as a sample.
   */
  sampleTexts?: string[];
}

export interface PageEditorSwitch {
  codeId: string;
  /** The code's name or short link, for the notice */
  codeLabel: string;
  /** What scans open until the page is published */
  opensNow: string;
  type: string;
  variantId: string | null;
}

type Issues = Map<string, string[]>;

const snapshot = (title: string, content: LandingPageContent) =>
  JSON.stringify({ title: title.trim(), content });

const draftKey = (id: string) => `qrdx:page-draft:${id}`;

interface Draft {
  version: number;
  title: string;
  content: LandingPageContent;
  savedAt: number;
}

function readDraft(id: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function writeDraft(id: string, draft: Draft | null) {
  try {
    if (draft) window.localStorage.setItem(draftKey(id), JSON.stringify(draft));
    else window.localStorage.removeItem(draftKey(id));
  } catch {
    // Storage full or blocked: drafts are a convenience only.
  }
}

/** Adds the custom CSS problem to the page settings block's issues. */
function withCssIssue(
  issues: Issues,
  content: LandingPageContent,
  error: string | null,
): Issues {
  if (!error) return issues;
  const key =
    content.blocks.find((block) => block.type === PAGE_SETTINGS_TYPE)?.id ??
    "page";
  issues.set(key, [...(issues.get(key) ?? []), error]);
  return issues;
}

const SAMPLE_KIND_LABELS: Record<SampleItem["kind"], string> = {
  link: "Sample link",
  photo: "Sample photo",
  text: "Sample text",
};

/** "Sample link: Register your warranty (example.com/warranty)" */
const sampleLine = (item: SampleItem) =>
  `${SAMPLE_KIND_LABELS[item.kind]}: ${item.text}${
    item.link && item.link !== item.text ? ` (${item.link})` : ""
  }`;

/** How many sample lines a list shows before "and N more". */
const SAMPLES_SHOWN = 6;

function SampleList({ items }: { items: SampleItem[] }) {
  const shown = items.slice(0, SAMPLES_SHOWN);
  const more = items.length - shown.length;
  return (
    <ul className="list-inside list-disc space-y-0.5">
      {shown.map((item, index) => (
        // Two samples can read the same ("Photo"); the position keeps them apart.
        <li className="truncate" key={`${item.blockId}-${index}`}>
          {sampleLine(item)}
        </li>
      ))}
      {more > 0 && <li>and {more} more</li>}
    </ul>
  );
}

/** Validation issues keyed by block id ("theme" for theme issues). */
function collectIssues(content: LandingPageContent): Issues {
  const issues: Issues = new Map();
  const result = parseLandingPageContent(content);
  if (result.success) return issues;
  for (const issue of result.error.issues) {
    const [root, index] = issue.path;
    const key =
      root === "blocks" && typeof index === "number"
        ? (content.blocks[index]?.id ?? "page")
        : root === "theme"
          ? "theme"
          : "page";
    issues.set(key, [...(issues.get(key) ?? []), issue.message]);
  }
  return issues;
}

function blockSummary(block: LandingBlock): string {
  const props = block.props as Record<string, unknown>;
  for (const key of [
    "title",
    "label",
    "heading",
    "firstName",
    "name",
    "body",
  ]) {
    const value = props[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const items = props.items;
  if (Array.isArray(items))
    return `${items.length} item${items.length === 1 ? "" : "s"}`;
  return "";
}

export function PageEditor({
  page,
  initialContent,
  code,
  savedThemes,
  canUseCustomCss,
  branding,
  storageEnabled,
  readOnly = false,
  switchCode,
  sampleTexts,
}: PageEditorProps) {
  const inWorkspace = useWorkspaceHref();
  const router = useRouter();
  const openUpgradeDialog = useGetProDialogStore(
    (state) => state.openUpgradeDialog,
  );
  const showLimit = useShowLimit();
  const [content, setContent] = useState(initialContent);
  const [title, setTitle] = useState(page.title ?? "");
  const [version, setVersion] = useState(page.version);
  const [published, setPublished] = useState(() =>
    snapshot(page.title ?? "", initialContent),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState("blocks");
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [conflict, setConflict] = useState(false);
  const [isPublishing, startPublishing] = useTransition();
  const dragId = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const dirty = snapshot(title, content) !== published;
  // Custom CSS (ee/white-label): the preview's styles, and its problem among
  // the page settings' issues.
  const previewCss = usePreviewCss(
    canUseCustomCss,
    getPageSettings(content).customCss,
  );
  const issues = useMemo(
    () => withCssIssue(collectIssues(content), content, previewCss.error),
    [content, previewCss.error],
  );
  const issueCount = [...issues.values()].reduce(
    (n, list) => n + list.length,
    0,
  );
  // The template's samples still on the page: marked on their blocks, listed
  // above them and before publishing (visitors never see sample links).
  const sampleWords = useMemo(() => new Set(sampleTexts ?? []), [sampleTexts]);
  const samples = useMemo(
    () => findSamples(content, sampleWords),
    [content, sampleWords],
  );
  const samplesInBlock = useMemo(() => samplesByBlock(samples), [samples]);
  const [samplesCheck, setSamplesCheck] = useState(false);

  // Offer to restore unpublished edits from this browser.
  useEffect(() => {
    const saved = readDraft(page.id);
    if (
      saved &&
      saved.version === page.version &&
      snapshot(saved.title, saved.content) !==
        snapshot(page.title ?? "", initialContent)
    ) {
      setDraft(saved);
    } else if (saved) {
      writeDraft(page.id, null);
    }
  }, [page.id, page.version, page.title, initialContent]);

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(
      () =>
        writeDraft(page.id, { version, title, content, savedAt: Date.now() }),
      800,
    );
    return () => clearTimeout(timer);
  }, [dirty, page.id, version, title, content]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const editableBlocks = content.blocks.filter(
    (block) => block.type !== PAGE_SETTINGS_TYPE,
  );
  const settingsBlock = content.blocks.find(
    (block) => block.type === PAGE_SETTINGS_TYPE,
  );
  const settings =
    (settingsBlock?.props as PageSettings | undefined) ?? DEFAULT_PAGE_SETTINGS;

  const setBlocks = (update: (blocks: LandingBlock[]) => LandingBlock[]) =>
    setContent((current) => ({ ...current, blocks: update(current.blocks) }));

  const updateBlock = (id: string, patch: Partial<LandingBlock>) =>
    setBlocks((blocks) =>
      blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)),
    );

  const addBlock = (type: string) => {
    const block = createBlock(type);
    setBlocks((blocks) => {
      const index = selected
        ? blocks.findIndex((current) => current.id === selected)
        : -1;
      const next = [...blocks];
      next.splice(index === -1 ? next.length : index + 1, 0, block);
      return next;
    });
    setSelected(block.id);
    setTab("blocks");
    requestAnimationFrame(() =>
      listRef.current
        ?.querySelector(`[data-editor-block="${block.id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  };

  const removeBlock = (id: string) => {
    const before = content.blocks;
    setBlocks((blocks) => blocks.filter((block) => block.id !== id));
    if (selected === id) setSelected(null);
    toast("Block removed", {
      action: { label: "Undo", onClick: () => setBlocks(() => before) },
    });
  };

  const duplicateBlock = (id: string) => {
    const source = content.blocks.find((block) => block.id === id);
    if (!source) return;
    const copy = { ...structuredClone(source), id: crypto.randomUUID() };
    setBlocks((blocks) => {
      const next = [...blocks];
      next.splice(next.findIndex((block) => block.id === id) + 1, 0, copy);
      return next;
    });
    setSelected(copy.id);
  };

  /** Moves within the visible list (page settings stay where they are). */
  const moveBlock = (id: string, toVisibleIndex: number) => {
    setBlocks((blocks) => {
      const visible = blocks.filter(
        (block) => block.type !== PAGE_SETTINGS_TYPE,
      );
      const from = visible.findIndex((block) => block.id === id);
      if (
        from === -1 ||
        toVisibleIndex < 0 ||
        toVisibleIndex >= visible.length
      ) {
        return blocks;
      }
      const [moved] = visible.splice(from, 1);
      if (moved) visible.splice(toVisibleIndex, 0, moved);
      return [
        ...visible,
        ...blocks.filter((block) => block.type === PAGE_SETTINGS_TYPE),
      ];
    });
  };

  const setSettings = (next: PageSettings) => {
    setBlocks((blocks) =>
      blocks.some((block) => block.type === PAGE_SETTINGS_TYPE)
        ? blocks.map((block) =>
            block.type === PAGE_SETTINGS_TYPE
              ? { ...block, props: next }
              : block,
          )
        : [...blocks, { ...createBlock(PAGE_SETTINGS_TYPE), props: next }],
    );
  };

  /** The page without its samples; null (and a toast) when that leaves issues. */
  const withoutSamples = (): LandingPageContent | null => {
    const next = removeSamples(content, sampleWords);
    const left = collectIssues(next).size;
    if (left > 0) {
      setContent(next);
      toast.error(
        "Samples removed. Fix the remaining issues before publishing",
      );
      return null;
    }
    return next;
  };

  const removeAllSamples = () => {
    const before = content;
    const next = removeSamples(content, sampleWords);
    setContent(next);
    if (selected && !next.blocks.some((block) => block.id === selected)) {
      setSelected(null);
    }
    toast("Samples removed", {
      description:
        findSamples(next, sampleWords).length > 0
          ? "Some are in blocks you've changed: edit those yourself."
          : undefined,
      action: { label: "Undo", onClick: () => setContent(before) },
    });
  };

  const publish = useCallback(
    (pageContent: LandingPageContent = content) => {
      // Issues are the editor's content's; content without its samples is
      // checked before it gets here (withoutSamples).
      if (issueCount > 0 && pageContent === content) {
        toast.error(
          `Fix ${issueCount} ${issueCount === 1 ? "issue" : "issues"} before publishing`,
        );
        return;
      }
      startPublishing(async () => {
        if (switchCode) {
          const switched = await publishCodeSwitchPage({
            codeId: switchCode.codeId,
            type: switchCode.type,
            variantId: switchCode.variantId,
            title: title.trim() || null,
            content: pageContent,
          });
          if (!switched.success) {
            // The hosted-pages cap: the plan limit card, as when creating one.
            if (switched.error.code === "LIMIT_REACHED") {
              showLimit("landingPages", { message: switched.error.message });
              return;
            }
            if (switched.error.code === "PLAN_REQUIRED") {
              openUpgradeDialog("business");
            }
            toast.error(switched.error.message);
            return;
          }
          setPublished(snapshot(title, pageContent));
          writeDraft(page.id, null);
          setDraft(null);
          track("page_published", { page_type: page.typeLabel });
          toast.success("Published", {
            description: "Scans of this code now open the page.",
          });
          router.push(
            inWorkspace(`/codes/${encodeURIComponent(switchCode.codeId)}`),
          );
          return;
        }
        const result = await publishLandingPage({
          id: page.id,
          title,
          content: pageContent,
          baseVersion: version,
        });
        if (!result.success) {
          if (result.error.code === "CONFLICT") setConflict(true);
          if (result.error.code === "PLAN_REQUIRED") {
            openUpgradeDialog("business");
          }
          toast.error(result.error.message);
          return;
        }
        setVersion(result.data.version);
        setPublished(snapshot(title, pageContent));
        writeDraft(page.id, null);
        setDraft(null);
        track("page_published", { page_type: page.typeLabel });
        toast.success("Published", {
          description: code
            ? "Scans now open the updated page."
            : "Create a QR code for this page to share it.",
        });
        router.refresh();
      });
    },
    [
      issueCount,
      page.id,
      page.typeLabel,
      title,
      content,
      version,
      code,
      router,
      openUpgradeDialog,
      switchCode,
      inWorkspace,
      showLimit,
    ],
  );

  /** Publish, asking first while the template's samples are on the page. */
  const requestPublish = useCallback(() => {
    if (issueCount === 0 && samples.length > 0) {
      setSamplesCheck(true);
      return;
    }
    publish();
  }, [issueCount, samples.length, publish]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!readOnly && (dirty || switchCode) && !isPublishing) {
          requestPublish();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, isPublishing, requestPublish, readOnly, switchCode]);

  const editorContext: BlockEditorContext = {
    theme: content.theme,
    pageId: page.id,
    storageEnabled,
    customDomain: code?.customDomain ?? null,
  };

  const css = previewCss.css;

  const onDrop = (event: DragEvent, targetIndex: number) => {
    event.preventDefault();
    const id = dragId.current;
    dragId.current = null;
    if (id) moveBlock(id, targetIndex);
  };

  const preview = (
    // Links don't navigate in the preview; tapping a block selects it.
    <div
      className="absolute inset-0 overflow-y-auto overscroll-contain"
      onClickCapture={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("a, button[type='submit'], form")) {
          event.preventDefault();
        }
        const blockId = target
          .closest<HTMLElement>("[data-block-id]")
          ?.getAttribute("data-block-id");
        if (blockId) {
          setSelected(blockId);
          setTab("blocks");
        }
      }}
    >
      {selected && /^[A-Za-z0-9_-]+$/.test(selected) && (
        <style>{`[data-block-id="${selected}"]{outline:2px dashed color-mix(in srgb, currentColor 45%, transparent);outline-offset:6px;border-radius:4px}`}</style>
      )}
      <LandingRender
        content={content}
        context={{
          theme: content.theme,
          mode: "preview",
          pageId: page.id,
          qrCodeId: code?.id ?? null,
        }}
        customCss={css}
        fill="container"
        footer={
          <LandingPageFooter
            badge={branding.badge}
            badgeHref="#"
            reportHref="#"
          />
        }
      />
    </div>
  );

  const codeLinks = switchCode ? (
    <Button asChild size="sm" variant="outline">
      <Link
        href={inWorkspace(`/codes/${encodeURIComponent(switchCode.codeId)}`)}
      >
        Cancel
      </Link>
    </Button>
  ) : code ? (
    <>
      <Button asChild size="sm" variant="outline">
        <Link href={inWorkspace(`/codes/${encodeURIComponent(code.id)}`)}>
          <QrCode />
          QR code
        </Link>
      </Button>
      <Button asChild size="sm" variant="outline">
        <a href={code.pageUrl} rel="noopener" target="_blank">
          <ExternalLink />
          View live
        </a>
      </Button>
      {/* NFC (feat/nfc) */}
      {code.nfcHref && (
        <Button asChild size="sm" title="Put on NFC" variant="outline">
          <Link href={code.nfcHref}>
            <Airdrop />
            {/* Icon only on phones, so Publish stays on the same row. */}
            <span className="sr-only sm:not-sr-only">Put on NFC</span>
          </Link>
        </Button>
      )}
    </>
  ) : (
    <span className="text-muted-foreground text-xs">
      No QR code links to this page yet
    </span>
  );

  if (readOnly) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Button asChild size="icon" title="All pages" variant="ghost">
              <Link aria-label="All pages" href={inWorkspace("/pages")}>
                <ArrowLeft />
              </Link>
            </Button>
            <h1 className="truncate text-base font-semibold">
              {page.title || `Untitled ${page.typeLabel.toLowerCase()}`}
            </h1>
            <Badge className="hidden sm:inline-flex" variant="secondary">
              {page.typeLabel}
            </Badge>
            <span className="text-muted-foreground hidden text-xs whitespace-nowrap sm:inline">
              Published · v{version}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">{codeLinks}</div>
        </div>
        <ViewOnlyNotice>
          You have view-only access, so this page can't be edited here.
        </ViewOnlyNotice>
        <PhoneFrame className="mx-auto w-full max-w-[340px]">
          <LandingRender
            content={initialContent}
            context={{
              theme: initialContent.theme,
              mode: "preview",
              pageId: page.id,
              qrCodeId: code?.id ?? null,
            }}
            customCss={css}
            fill="container"
            footer={
              <LandingPageFooter
                badge={branding.badge}
                badgeHref="#"
                reportHref="#"
              />
            }
          />
        </PhoneFrame>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {switchCode ? (
            <Button
              asChild
              size="icon"
              title="Back to the code"
              variant="ghost"
            >
              <Link
                aria-label="Back to the code"
                href={inWorkspace(
                  `/codes/${encodeURIComponent(switchCode.codeId)}`,
                )}
              >
                <ArrowLeft />
              </Link>
            </Button>
          ) : (
            <Button asChild size="icon" title="All pages" variant="ghost">
              <Link aria-label="All pages" href={inWorkspace("/pages")}>
                <ArrowLeft />
              </Link>
            </Button>
          )}
          <Input
            aria-label="Page title"
            className="h-9 max-w-sm text-base font-semibold"
            maxLength={100}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={`Untitled ${page.typeLabel.toLowerCase()}`}
            value={title}
          />
          <Badge className="hidden sm:inline-flex" variant="secondary">
            {page.typeLabel}
          </Badge>
          <span
            aria-live="polite"
            className="text-muted-foreground hidden text-xs whitespace-nowrap sm:inline"
          >
            {switchCode
              ? "Not published yet"
              : dirty
                ? "Unpublished changes"
                : `Published · v${version}`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {codeLinks}
          <Button
            disabled={(!dirty && !switchCode) || isPublishing}
            onClick={requestPublish}
            size="sm"
            title="Publish (⌘S)"
          >
            {isPublishing && <ModuleOrbit aria-hidden />}
            {isPublishing ? "Publishing..." : "Publish"}
          </Button>
        </div>
      </div>

      {!(readOnly || switchCode || dirty) && (
        <PagePlanNote variant="published" />
      )}
      {switchCode && (
        <p className="bg-muted rounded-md p-3 text-sm">
          When you publish, scans of{" "}
          <span className="font-medium">{switchCode.codeLabel}</span> open this
          page. The printed code stays the same. Until then, scans still open{" "}
          {switchCode.opensNow}.
        </p>
      )}
      {draft && (
        <div className="bg-muted flex flex-col gap-2 rounded-md p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>
            You have unpublished changes from{" "}
            {new Date(draft.savedAt).toLocaleString()} in this browser.
          </span>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setContent(draft.content);
                setTitle(draft.title);
                setDraft(null);
              }}
              size="sm"
            >
              Restore
            </Button>
            <Button
              onClick={() => {
                writeDraft(page.id, null);
                setDraft(null);
              }}
              size="sm"
              variant="ghost"
            >
              Discard
            </Button>
          </div>
        </div>
      )}
      {conflict && (
        <div
          className="bg-destructive/10 text-destructive flex flex-col gap-2 rounded-md p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <span>
            This page was published from somewhere else. Reload to continue from
            the latest version.
          </span>
          <Button
            onClick={() => {
              writeDraft(page.id, null);
              window.location.reload();
            }}
            size="sm"
            variant="outline"
          >
            Reload
          </Button>
        </div>
      )}

      <div className="flex gap-1 lg:hidden">
        {(["edit", "preview"] as const).map((value) => (
          <Button
            aria-pressed={view === value}
            key={value}
            onClick={() => setView(value)}
            size="sm"
            variant={view === value ? "secondary" : "ghost"}
          >
            {value === "edit" ? "Edit" : "Preview"}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className={cn("min-w-0", view === "preview" && "hidden lg:block")}>
          <Tabs onValueChange={setTab} value={tab}>
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="blocks">
                Blocks
                {issues.size > 0 &&
                  [...issues.keys()].some((key) => key !== "theme") && (
                    <AlertCircle className="text-destructive size-3.5" />
                  )}
              </TabsTrigger>
              <TabsTrigger value="design">
                Design
                {issues.has("theme") && (
                  <AlertCircle className="text-destructive size-3.5" />
                )}
              </TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent className="mt-4 space-y-3" value="blocks">
              {samples.length > 0 ? (
                // The template's samples still on the page, published or not.
                <div
                  className="bg-muted text-muted-foreground space-y-2 rounded-md p-3 text-xs"
                  role="status"
                >
                  <p className="flex items-start gap-2">
                    <AlertCircle className="mt-px size-3.5 shrink-0" />
                    <span>
                      <span className="text-foreground font-medium">
                        {samples.length === 1
                          ? "1 sample from the template is still on this page."
                          : `${samples.length} samples from the template are still on this page.`}
                      </span>{" "}
                      Visitors never see sample links, but they do see sample
                      text and photos. Replace them with your own, or remove
                      them.
                    </span>
                  </p>
                  <div className="pl-5.5">
                    <SampleList items={samples} />
                  </div>
                  {!readOnly && (
                    <div className="pl-5.5">
                      <Button
                        onClick={removeAllSamples}
                        size="sm"
                        variant="outline"
                      >
                        <Trash2 />
                        Remove all samples
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                version === 1 && (
                  // Never published: the template's names, prices and
                  // numbers may still be samples, even when none is marked.
                  <p className="bg-muted text-muted-foreground flex items-start gap-2 rounded-md p-3 text-xs">
                    <AlertCircle className="mt-px size-3.5 shrink-0" />
                    <span>
                      This page starts with sample text, numbers and photos from
                      its template. Replace them with your own before you share
                      the code.
                    </span>
                  </p>
                )
              )}
              <div className="space-y-2" ref={listRef}>
                {editableBlocks.length === 0 && (
                  <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
                    This page is empty. Add your first block.
                  </p>
                )}
                {editableBlocks.map((block, index) => {
                  const definition = getBlock(block.type);
                  const open = selected === block.id;
                  const blockIssues = issues.get(block.id);
                  const blockSamples = samplesInBlock.get(block.id) ?? 0;
                  const Icon = definition?.icon;
                  const Editor = definition?.Editor;
                  const summary = blockSummary(block);
                  return (
                    // biome-ignore lint/a11y/noStaticElementInteractions: drop target for drag reordering; the move buttons are the keyboard alternative
                    <div
                      className={cn(
                        "bg-card rounded-lg border transition-shadow",
                        open && "ring-ring/40 ring-2",
                        blockIssues && "border-destructive/60",
                        block.hidden && "opacity-60",
                      )}
                      data-editor-block={block.id}
                      key={block.id}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => onDrop(event, index)}
                    >
                      <div className="flex items-center gap-1 p-1.5">
                        <span
                          aria-hidden="true"
                          className="text-muted-foreground hidden cursor-grab p-1 active:cursor-grabbing sm:block"
                          draggable
                          onDragEnd={() => {
                            dragId.current = null;
                          }}
                          onDragStart={(event) => {
                            dragId.current = block.id;
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          title="Drag to reorder"
                        >
                          <GripVertical className="size-4" />
                        </span>
                        <button
                          aria-expanded={open}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted"
                          onClick={() => setSelected(open ? null : block.id)}
                          type="button"
                        >
                          {Icon && <Icon className="size-4 shrink-0" />}
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">
                              {definition?.label ?? block.type}
                            </span>
                            {summary && (
                              <span className="text-muted-foreground block truncate text-xs">
                                {summary}
                              </span>
                            )}
                          </span>
                          {blockSamples > 0 && (
                            <Badge
                              className="text-muted-foreground shrink-0"
                              title="Sample: replace or remove"
                              variant="outline"
                            >
                              Sample
                            </Badge>
                          )}
                          {blockIssues && (
                            <AlertCircle className="text-destructive size-4 shrink-0" />
                          )}
                          <ChevronDown
                            className={cn(
                              "text-muted-foreground size-4 shrink-0 transition-transform",
                              open && "rotate-180",
                            )}
                          />
                        </button>
                        <Button
                          aria-label="Move up"
                          className="size-8"
                          disabled={index === 0}
                          onClick={() => moveBlock(block.id, index - 1)}
                          size="icon"
                          variant="ghost"
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          aria-label="Move down"
                          className="size-8"
                          disabled={index === editableBlocks.length - 1}
                          onClick={() => moveBlock(block.id, index + 1)}
                          size="icon"
                          variant="ghost"
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          aria-label={
                            block.hidden ? "Show block" : "Hide block"
                          }
                          className="size-8"
                          onClick={() =>
                            updateBlock(block.id, {
                              hidden: block.hidden ? undefined : true,
                            })
                          }
                          size="icon"
                          title={block.hidden ? "Hidden on the page" : "Hide"}
                          variant="ghost"
                        >
                          {block.hidden ? <EyeOff /> : <Eye />}
                        </Button>
                        <Button
                          aria-label="Duplicate block"
                          className="hidden size-8 sm:inline-flex"
                          onClick={() => duplicateBlock(block.id)}
                          size="icon"
                          variant="ghost"
                        >
                          <Copy />
                        </Button>
                        <Button
                          aria-label="Remove block"
                          className="size-8"
                          onClick={() => removeBlock(block.id)}
                          size="icon"
                          variant="ghost"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                      {open && (
                        <div className="space-y-3 border-t p-4">
                          {blockIssues && (
                            <ul
                              className="bg-destructive/10 text-destructive list-inside list-disc rounded-md p-2 text-xs"
                              role="alert"
                            >
                              {[...new Set(blockIssues)].map((message) => (
                                <li key={message}>{message}</li>
                              ))}
                            </ul>
                          )}
                          {blockSamples > 0 && (
                            <div className="bg-muted text-muted-foreground space-y-1 rounded-md p-2 text-xs">
                              <p className="text-foreground font-medium">
                                Sample: replace or remove
                              </p>
                              <SampleList
                                items={samples.filter(
                                  (item) => item.blockId === block.id,
                                )}
                              />
                            </div>
                          )}
                          {Editor ? (
                            <Editor
                              context={editorContext}
                              id={block.id}
                              onChange={(props: Record<string, unknown>) =>
                                updateBlock(block.id, { props })
                              }
                              value={block.props}
                            />
                          ) : (
                            <p className="text-muted-foreground text-sm">
                              This block type is no longer available. Remove it
                              to publish.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <AddBlockMenu
                disabled={content.blocks.length >= 100}
                onAdd={addBlock}
              />
            </TabsContent>

            <TabsContent className="mt-4" value="design">
              {issues.get("theme") && (
                <ul
                  className="bg-destructive/10 text-destructive mb-4 list-inside list-disc rounded-md p-2 text-xs"
                  role="alert"
                >
                  {[...new Set(issues.get("theme"))].map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}
              <ThemeControls
                onChange={(theme) =>
                  setContent((current) => ({ ...current, theme }))
                }
                savedThemes={savedThemes}
                theme={content.theme}
              />
            </TabsContent>

            <TabsContent className="mt-4 space-y-3" value="settings">
              {settingsBlock && issues.get(settingsBlock.id) && (
                <ul
                  className="bg-destructive/10 text-destructive list-inside list-disc rounded-md p-2 text-xs"
                  role="alert"
                >
                  {[...new Set(issues.get(settingsBlock.id))].map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}
              <PageSettingsEditor
                context={editorContext}
                customCssAllowed={canUseCustomCss}
                id={settingsBlock?.id ?? "page-settings"}
                onChange={setSettings}
                value={settings}
              />
              <BrandingSection
                badge={branding.badge}
                whiteLabel={branding.whiteLabel}
              />
            </TabsContent>
          </Tabs>
        </div>

        <div className={cn(view === "edit" && "hidden lg:block")}>
          <div className="sticky top-6 space-y-2">
            <PhoneFrame className="mx-auto w-full max-w-[340px]">
              {preview}
            </PhoneFrame>
            <p className="text-muted-foreground text-center text-xs">
              Live preview · tap a block to edit it
            </p>
          </div>
        </div>
      </div>

      {/* Publishing with samples: say what's left, never block. */}
      <AlertDialog onOpenChange={setSamplesCheck} open={samplesCheck}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Publish with samples from the template?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {samples.length === 1
                    ? "This sample is still on the page."
                    : `These ${samples.length} samples are still on the page.`}{" "}
                  Visitors won't see sample links, but they will see sample text
                  and photos.
                </p>
                <SampleList items={samples} />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <Button
              onClick={() => {
                setSamplesCheck(false);
                publish();
              }}
              variant="outline"
            >
              Publish anyway
            </Button>
            <Button
              onClick={() => {
                setSamplesCheck(false);
                const next = withoutSamples();
                if (!next) return;
                setContent(next);
                publish(next);
              }}
            >
              Remove samples and publish
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
