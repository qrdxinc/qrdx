"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import {
  type FrameImportColor,
  type FrameImportWarning,
  type FrameSpec,
  importFrameSvg,
} from "qrdx";
import type { QRCustomFrame } from "qrdx/types";
import { z } from "zod";
import { getPageForEdit } from "@/app/(app)/dashboard/pages/_lib/landing-pages";
import { findThemeById } from "@/app/(app)/dashboard/themes/_lib/queries";
import { CHAT_DRAFT_SOURCE } from "@/lib/ai/agent/community";
import {
  type CommunityActionText,
  communityActionText,
  ENGLISH_COMMUNITY_TEXT,
  lazyCommunityText,
} from "@/lib/community/action-text";
import { publishCollection, publishKit } from "@/lib/community/bundles";
import {
  CopyRefusedError,
  copyItemToWorkspace,
  copyKitToWorkspace,
  copyTemplateToWorkspace,
} from "@/lib/community/copies";
import {
  type KeptProblem,
  type ScrubbedField,
  scrubPageContent,
  scrubSummary,
} from "@/lib/community/page-template";
import {
  getMyCommunityProfile,
  type MyCommunityProfile,
  ProfileInputError,
  saveCommunityProfile,
} from "@/lib/community/profiles";
import {
  PublishError,
  publishFrame,
  publishPageTemplate,
  publishStyle,
  unpublishItem,
} from "@/lib/community/publish";
import {
  canPublishFromWorkspace,
  themePublishAccess,
} from "@/lib/community/publish-access";
import { savedFrames } from "@/lib/community/queries";
import {
  ItemNotFoundError,
  toggleItemLike,
  toggleItemSave,
} from "@/lib/community/reactions";
import { CommunityUnavailableError } from "@/lib/community/store";
import { type CommunityItemType, itemPath } from "@/lib/community/types";
import { HttpError } from "@/lib/error-response";
import { getTemplate } from "@/lib/landing/templates";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { getCurrentUserId, logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";
import type { LandingPageContent } from "@/types/landing";
import type { ThemeStyles } from "@/types/theme";

// Server actions for the community pages and the editor's frame tools.
// Each returns a plain result the client shows as it is; nothing here
// trusts what the client says a design scores or contains.
//
// Messages are in the language of the page that shows them
// (lib/community/action-text.ts): the actions the editor calls take the
// page's language from the client (`pageLocale`, its useLocale()), those
// only app pages call use the app's language, and those only the community
// pages call (English only) answer in English.

export type CommunityResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code:
        | "UNAUTHORIZED"
        | "UNAVAILABLE"
        | "RATE_LIMITED"
        | "VALIDATION_ERROR"
        | "SCAN_GATE"
        | "ALREADY_PUBLISHED"
        | "LICENSE_REQUIRED"
        | "NOT_FOUND"
        | "THEME_LIMIT_REACHED"
        | "PAGE_LIMIT_REACHED"
        | "FORBIDDEN"
        | "CONFLICT"
        | "UNKNOWN";
      message: string;
      /** For ALREADY_PUBLISHED: the existing item's page */
      href?: string;
    };

const publishLimiter = createRateLimiter({
  limiter: slidingWindow(10, "1 d"),
});
const importLimiter = createRateLimiter({
  limiter: slidingWindow(30, "1 h"),
});
const reactionLimiter = createRateLimiter({
  limiter: slidingWindow(120, "1 h"),
});

const fail = <T>(
  code: Extract<CommunityResult<T>, { ok: false }>["code"],
  message: string,
  href?: string,
): CommunityResult<T> => ({ ok: false, code, message, ...(href && { href }) });

async function limited(
  limiter: ReturnType<typeof createRateLimiter>,
  key: string,
): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return false;
  const { success } = await limiter.limit(key);
  return !success;
}

/** `error` as a refusal, said in `text`'s language. */
function failure<T>(
  error: unknown,
  action: string,
  text: CommunityActionText,
): CommunityResult<T> {
  if (error instanceof UnauthorizedError) {
    return fail("UNAUTHORIZED", text.actions.signIn);
  }
  if (error instanceof CommunityUnavailableError) {
    return fail("UNAVAILABLE", error.messageIn(text.checks));
  }
  if (error instanceof PublishError) {
    return fail(
      error.code,
      error.messageIn(text.checks),
      error.slug ? itemPath(error.type ?? "frame", error.slug) : undefined,
    );
  }
  if (error instanceof ProfileInputError) {
    return fail("VALIDATION_ERROR", error.messageIn(text.checks));
  }
  if (error instanceof ItemNotFoundError) {
    return fail("NOT_FOUND", error.messageIn(text.checks));
  }
  // Only the community pages copy, and they're English.
  if (error instanceof CopyRefusedError) {
    return fail(error.code, error.message);
  }
  logError(error as Error, { action });
  return fail("UNKNOWN", text.actions.failed);
}

/**
 * The daily publish limit, counted only once every check has passed (it
 * runs right before the write), so a refused publish never uses it up.
 */
const countPublish = (userId: string) => async () => {
  if (await limited(publishLimiter, `community-publish:${userId}`)) {
    throw new PublishError("RATE_LIMITED", (m) => m.publishedALot);
  }
};

const publishFrameSchema = z.object({
  frame: z.unknown(),
  name: z.string().max(200),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  acceptLicense: z.boolean(),
});

/**
 * Publishes a custom frame (Great scan score, spec limits, CC0). The editor
 * calls it, in the page's language (`pageLocale`).
 */
export async function publishCommunityFrame(
  input: z.input<typeof publishFrameSchema>,
  pageLocale?: string,
): Promise<CommunityResult<{ href: string }>> {
  const text = lazyCommunityText(pageLocale, "publishCommunityFrame");
  try {
    const userId = await getCurrentUserId();
    const parsed = publishFrameSchema.safeParse(input);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", (await text()).actions.checkDetails);
    }
    if (parsed.data.acceptLicense !== true) {
      return fail("LICENSE_REQUIRED", (await text()).checks.licenceRequired);
    }
    const item = await publishFrame({
      beforeWrite: countPublish(userId),
      userId,
      frame: parsed.data.frame,
      details: {
        name: parsed.data.name,
        description: parsed.data.description,
        tags: parsed.data.tags,
      },
    });
    return { ok: true, data: { href: itemPath(item.type, item.slug) } };
  } catch (error) {
    return failure(error, "publishCommunityFrame", await text());
  }
}

/** A chat tool call id (the draft the AI chat's card was made for). */
const CHAT_DRAFT_ID = /^[A-Za-z0-9_-]{1,96}$/;

const publishDesignSchema = z.object({
  style: z.record(z.string(), z.unknown()),
  name: z.string().max(200),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  acceptLicense: z.boolean(),
  /** The AI chat's draft this publish answers (publish_to_community) */
  chatDraftId: z.string().regex(CHAT_DRAFT_ID).optional(),
});

/**
 * Publishes a design that isn't a saved theme (the AI chat's): the same
 * checks as a saved theme (lib/community/publish.ts publishStyle), run on
 * the style sent here; nothing the client says about it is trusted. Only a
 * person's click in the publish dialog calls this, never the model. In the
 * editor's language (`pageLocale`).
 */
export async function publishCommunityDesign(
  input: z.input<typeof publishDesignSchema>,
  pageLocale?: string,
): Promise<CommunityResult<{ href: string }>> {
  const text = lazyCommunityText(pageLocale, "publishCommunityDesign");
  try {
    const userId = await getCurrentUserId();
    const parsed = publishDesignSchema.safeParse(input);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", (await text()).actions.checkDetails);
    }
    if (parsed.data.acceptLicense !== true) {
      return fail("LICENSE_REQUIRED", (await text()).checks.licenceRequired);
    }
    const item = await publishStyle({
      beforeWrite: countPublish(userId),
      userId,
      style: parsed.data.style as ThemeStyles,
      details: {
        name: parsed.data.name,
        description: parsed.data.description,
        tags: parsed.data.tags,
      },
      ...(parsed.data.chatDraftId
        ? {
            source: { kind: CHAT_DRAFT_SOURCE, id: parsed.data.chatDraftId },
          }
        : {}),
    });
    return { ok: true, data: { href: itemPath(item.type, item.slug) } };
  } catch (error) {
    return failure(error, "publishCommunityDesign", await text());
  }
}

const publishThemeFrameSchema = publishFrameSchema
  .omit({ frame: true })
  .extend({ themeId: z.string().min(1).max(64) });

/**
 * Publishes the custom frame of a saved theme (the dashboard's Themes page).
 * The frame is read from the saved theme on the server, never taken from the
 * client, and the theme's access rules apply: your themes, or a workspace's
 * as its owner or admin. Then it's the same publish as the editor's. In
 * the page's language (`pageLocale`, the same dialog sends it).
 */
export async function publishCommunityThemeFrame(
  input: z.input<typeof publishThemeFrameSchema>,
  pageLocale?: string,
): Promise<CommunityResult<{ href: string }>> {
  const text = lazyCommunityText(pageLocale, "publishCommunityThemeFrame");
  try {
    const userId = await getCurrentUserId();
    const parsed = publishThemeFrameSchema.safeParse(input);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", (await text()).actions.checkDetails);
    }
    if (parsed.data.acceptLicense !== true) {
      return fail("LICENSE_REQUIRED", (await text()).checks.licenceRequired);
    }
    const theme = await findThemeById(parsed.data.themeId);
    const access = theme ? await themePublishAccess(userId, theme) : "none";
    if (!theme || access === "none") {
      return fail("NOT_FOUND", (await text()).actions.themeNotInWorkspace);
    }
    if (access === "view") {
      return fail("NOT_FOUND", (await text()).checks.workspacePublishRefusal);
    }
    const frame = (theme.style as { frame?: { style?: unknown } } | null)
      ?.frame;
    if (frame?.style !== "custom") {
      return fail("VALIDATION_ERROR", (await text()).actions.noCustomFrame);
    }
    const item = await publishFrame({
      beforeWrite: countPublish(userId),
      userId,
      frame,
      details: {
        name: parsed.data.name,
        description: parsed.data.description,
        tags: parsed.data.tags,
      },
      source: { kind: "qr_preset", id: theme.id },
    });
    return { ok: true, data: { href: itemPath(item.type, item.slug) } };
  } catch (error) {
    return failure(error, "publishCommunityThemeFrame", await text());
  }
}

// ── Page templates ─────────────────────────────────────────────────────────

/** A hosted page of the open workspace that `scope` may publish. */
async function publishablePage(
  pageId: unknown,
  text: () => Promise<CommunityActionText>,
): Promise<
  | {
      ok: true;
      scope: ActiveScope;
      page: Awaited<ReturnType<typeof getPageForEdit>>;
    }
  | { ok: false; result: CommunityResult<never> }
> {
  const notFound = async () => ({
    ok: false as const,
    result: fail<never>("NOT_FOUND", (await text()).actions.pageNotFound),
  });
  const id = idSchema.safeParse(pageId);
  if (!id.success) return notFound();
  const scope = await getActiveScope();
  if (!canPublishFromWorkspace(scope)) {
    return {
      ok: false,
      result: fail("FORBIDDEN", (await text()).checks.workspacePublishRefusal),
    };
  }
  try {
    return { ok: true, scope, page: await getPageForEdit(scope, id.data) };
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return notFound();
    throw error;
  }
}

export interface CommunityPagePreview {
  /** The page as it would be shared, personal data taken out */
  content: LandingPageContent;
  /** What was changed, one line each */
  changes: string[];
  /** Text fields replaced with sample text; each can be kept */
  fields: ScrubbedField[];
  /** Kept text that can't be published */
  problems: KeptProblem[];
  pageType: string;
  /** A neutral name from the page type, never the page's own title */
  defaultName: string;
  /** The page version reviewed; publishing refuses a newer one */
  version: number;
}

const keepSchema = z.array(z.string().min(1).max(200)).max(500);

/**
 * The publish dialog's review step: the page scrubbed as it would be
 * shared (lib/community/page-template.ts) and what was taken out. Nothing
 * is stored. Only the dashboard's Pages calls it: the app's language.
 */
export async function previewCommunityPage(
  pageId: string,
  keep: string[] = [],
): Promise<CommunityResult<CommunityPagePreview>> {
  const text = lazyCommunityText(undefined, "previewCommunityPage");
  try {
    await getCurrentUserId();
    const kept = keepSchema.safeParse(keep);
    if (!kept.success) {
      return fail("VALIDATION_ERROR", (await text()).actions.checkDetails);
    }
    const found = await publishablePage(pageId, text);
    if (!found.ok) return found.result;
    const { checks, pageChanges } = await text();
    const { content, report, fields, problems } = scrubPageContent(
      found.page.content,
      { keep: kept.data, messages: checks },
    );
    return {
      ok: true,
      data: {
        content,
        changes: scrubSummary(report, pageChanges),
        fields,
        problems,
        pageType: found.page.type,
        defaultName: getTemplate(found.page.type)?.label ?? "Page template",
        version: found.page.version,
      },
    };
  } catch (error) {
    return failure(error, "previewCommunityPage", await text());
  }
}

const publishPageSchema = z.object({
  pageId: z.string().min(1).max(64),
  /** The page version the publisher reviewed */
  version: z.number().int().min(1),
  keep: keepSchema.optional(),
  name: z.string().max(200),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  acceptLicense: z.boolean(),
});

/**
 * Publishes a hosted page as a page template: read from the database (never
 * from the client), scrubbed of personal data, then checked and stored. In
 * a shared workspace only owners and admins may. Only the dashboard's Pages
 * calls it: the app's language.
 */
export async function publishCommunityPage(
  input: z.input<typeof publishPageSchema>,
): Promise<CommunityResult<{ href: string; changes: string[] }>> {
  const text = lazyCommunityText(undefined, "publishCommunityPage");
  try {
    const userId = await getCurrentUserId();
    const parsed = publishPageSchema.safeParse(input);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", (await text()).actions.checkDetails);
    }
    if (parsed.data.acceptLicense !== true) {
      return fail("LICENSE_REQUIRED", (await text()).checks.licenceRequired);
    }
    const found = await publishablePage(parsed.data.pageId, text);
    if (!found.ok) return found.result;
    // What's published is what was reviewed.
    if (found.page.version !== parsed.data.version) {
      return fail("CONFLICT", (await text()).actions.pageChanged);
    }
    const item = await publishPageTemplate({
      keep: parsed.data.keep ?? [],
      beforeWrite: countPublish(userId),
      userId,
      page: {
        id: found.page.id,
        type: found.page.type,
        content: found.page.content,
      },
      details: {
        name: parsed.data.name,
        description: parsed.data.description,
        tags: parsed.data.tags,
      },
    });
    return {
      ok: true,
      data: {
        href: itemPath(item.type, item.slug),
        changes: scrubSummary(item.report, (await text()).pageChanges),
      },
    };
  } catch (error) {
    return failure(error, "publishCommunityPage", await text());
  }
}

export interface ImportedFrame {
  spec: FrameSpec;
  warnings: FrameImportWarning[];
  palette: FrameImportColor[];
}

/** Largest SVG sent to the importer (it refuses more than 200 KB itself). */
const MAX_SVG_CHARS = 210_000;

/**
 * Converts an uploaded SVG into a frame spec on the server. The editor
 * calls it, in the page's language (`pageLocale`); what the importer itself
 * says (the qrdx engine) is English.
 */
export async function importCommunityFrameSvg(
  svg: string,
  pageLocale?: string,
): Promise<CommunityResult<ImportedFrame>> {
  const text = lazyCommunityText(pageLocale, "importCommunityFrameSvg");
  try {
    const userId = await getCurrentUserId();
    if (typeof svg !== "string" || svg.length > MAX_SVG_CHARS) {
      return fail("VALIDATION_ERROR", (await text()).actions.svgTooLarge);
    }
    if (await limited(importLimiter, `community-import:${userId}`)) {
      return fail("RATE_LIMITED", (await text()).actions.tooManyImports);
    }
    const result = importFrameSvg(svg);
    if (!result.ok) return fail("VALIDATION_ERROR", result.error);
    return {
      ok: true,
      data: {
        spec: result.spec,
        warnings: result.warnings,
        palette: result.palette,
      },
    };
  } catch (error) {
    return failure(error, "importCommunityFrameSvg", await text());
  }
}

const idSchema = z.string().min(1).max(64);

/**
 * Likes or unlikes an item: from the community pages (English) and the
 * editor's community sheet, each in its page's language (`pageLocale`).
 */
export async function toggleCommunityLike(
  itemId: string,
  pageLocale?: string,
): Promise<CommunityResult<{ liked: boolean; likeCount: number }>> {
  const text = lazyCommunityText(pageLocale, "toggleCommunityLike");
  try {
    const userId = await getCurrentUserId();
    const id = idSchema.parse(itemId);
    if (await limited(reactionLimiter, `community-react:${userId}`)) {
      return fail("RATE_LIMITED", (await text()).actions.tooManyChanges);
    }
    return { ok: true, data: await toggleItemLike(userId, id) };
  } catch (error) {
    return failure(error, "toggleCommunityLike", await text());
  }
}

/** Saves or unsaves an item: only the community pages (English) call it. */
export async function toggleCommunitySave(
  itemId: string,
): Promise<CommunityResult<{ saved: boolean }>> {
  const text = ENGLISH_COMMUNITY_TEXT;
  try {
    const userId = await getCurrentUserId();
    const id = idSchema.parse(itemId);
    if (await limited(reactionLimiter, `community-react:${userId}`)) {
      return fail("RATE_LIMITED", text.actions.tooManyChanges);
    }
    return { ok: true, data: await toggleItemSave(userId, id) };
  } catch (error) {
    return failure(error, "toggleCommunitySave", text);
  }
}

/** The creator unpublishes their own item, on its page (English). */
export async function unpublishCommunityItem(
  itemId: string,
): Promise<CommunityResult<{ removed: true }>> {
  try {
    const userId = await getCurrentUserId();
    const id = idSchema.parse(itemId);
    if (!(await unpublishItem(userId, id))) {
      return fail(
        "NOT_FOUND",
        "Only the person who published it can unpublish it.",
      );
    }
    return { ok: true, data: { removed: true } };
  } catch (error) {
    return failure(error, "unpublishCommunityItem", ENGLISH_COMMUNITY_TEXT);
  }
}

const refSchema = z.object({
  type: z.enum(["frame", "theme"]),
  slug: z.string().min(1).max(80),
});

/**
 * Copies a frame or theme into the workspace as a saved theme. Only the
 * community pages (English) call it, and the copies below.
 */
export async function copyCommunityItem(ref: {
  type: CommunityItemType;
  slug: string;
}): Promise<
  CommunityResult<{ themeId: string; name: string; where: "own" | "team" }>
> {
  try {
    const scope = await getActiveScope();
    const parsed = refSchema.safeParse(ref);
    if (!parsed.success)
      return fail("NOT_FOUND", "This item isn't in the community.");
    return { ok: true, data: await copyItemToWorkspace(scope, parsed.data) };
  } catch (error) {
    return failure(error, "copyCommunityItem", ENGLISH_COMMUNITY_TEXT);
  }
}

const templateRefSchema = z.object({ slug: z.string().min(1).max(80) });

/**
 * "Use template": copies a page template into the open workspace as a
 * draft page (no QR code yet), within the plan's page limit. Only its
 * community page (English) calls it.
 */
export async function copyCommunityTemplate(ref: {
  slug: string;
}): Promise<CommunityResult<{ pageId: string; name: string }>> {
  try {
    const scope = await getActiveScope();
    const parsed = templateRefSchema.safeParse(ref);
    if (!parsed.success) {
      return fail("NOT_FOUND", "This template isn't in the community.");
    }
    return {
      ok: true,
      data: await copyTemplateToWorkspace(scope, parsed.data.slug),
    };
  } catch (error) {
    return failure(error, "copyCommunityTemplate", ENGLISH_COMMUNITY_TEXT);
  }
}

// ── Collections and kits ───────────────────────────────────────────────────

const bundleDetailsSchema = z.object({
  name: z.string().max(200),
  description: z.string().max(2000).optional(),
  acceptLicense: z.boolean(),
});

const publishCollectionSchema = bundleDetailsSchema.extend({
  itemIds: z.array(z.string().min(1).max(64)).max(60),
});

/**
 * Publishes a collection of published items (2 to 48, in order), from
 * /community/new (English).
 */
export async function publishCommunityCollection(
  input: z.input<typeof publishCollectionSchema>,
): Promise<CommunityResult<{ href: string }>> {
  const text = ENGLISH_COMMUNITY_TEXT;
  try {
    const userId = await getCurrentUserId();
    const parsed = publishCollectionSchema.safeParse(input);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", text.actions.checkDetails);
    }
    if (parsed.data.acceptLicense !== true) {
      return fail("LICENSE_REQUIRED", text.checks.licenceRequired);
    }
    const item = await publishCollection({
      beforeWrite: countPublish(userId),
      userId,
      itemIds: parsed.data.itemIds,
      details: {
        name: parsed.data.name,
        description: parsed.data.description,
      },
    });
    return { ok: true, data: { href: itemPath(item.type, item.slug) } };
  } catch (error) {
    return failure(error, "publishCommunityCollection", ENGLISH_COMMUNITY_TEXT);
  }
}

const publishKitSchema = bundleDetailsSchema.extend({
  page: z.string().min(1).max(64),
  theme: z.string().min(1).max(64).nullish(),
  frame: z.string().min(1).max(64).nullish(),
});

/**
 * Publishes a kit: a page template with a theme and/or a frame, from
 * /community/new (English).
 */
export async function publishCommunityKit(
  input: z.input<typeof publishKitSchema>,
): Promise<CommunityResult<{ href: string }>> {
  const text = ENGLISH_COMMUNITY_TEXT;
  try {
    const userId = await getCurrentUserId();
    const parsed = publishKitSchema.safeParse(input);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", text.actions.checkDetails);
    }
    if (parsed.data.acceptLicense !== true) {
      return fail("LICENSE_REQUIRED", text.checks.licenceRequired);
    }
    const item = await publishKit({
      beforeWrite: countPublish(userId),
      userId,
      parts: {
        page: parsed.data.page,
        theme: parsed.data.theme ?? null,
        frame: parsed.data.frame ?? null,
      },
      details: {
        name: parsed.data.name,
        description: parsed.data.description,
      },
    });
    return { ok: true, data: { href: itemPath(item.type, item.slug) } };
  } catch (error) {
    return failure(error, "publishCommunityKit", ENGLISH_COMMUNITY_TEXT);
  }
}

/**
 * "Use kit": its page template as a draft page and its look (the theme
 * with the frame on it) as a saved theme, in the open workspace. Only its
 * community page (English) calls it.
 */
export async function copyCommunityKit(ref: { slug: string }): Promise<
  CommunityResult<{
    pageId: string;
    name: string;
    themeName: string | null;
    themeRefused: string | null;
  }>
> {
  try {
    const scope = await getActiveScope();
    const parsed = templateRefSchema.safeParse(ref);
    if (!parsed.success) {
      return fail("NOT_FOUND", "This kit isn't in the community.");
    }
    return {
      ok: true,
      data: await copyKitToWorkspace(scope, parsed.data.slug),
    };
  } catch (error) {
    return failure(error, "copyCommunityKit", ENGLISH_COMMUNITY_TEXT);
  }
}

/** The viewer's saved frames (empty when signed out or not available). */
export async function getSavedCommunityFrames(): Promise<
  { id: string; name: string; frame: QRCustomFrame }[]
> {
  try {
    const userId = await getCurrentUserId();
    return await savedFrames(userId);
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) {
      logError(error as Error, { action: "getSavedCommunityFrames" });
    }
    return [];
  }
}

/** The viewer's community profile, in the app's language. */
export async function getMyCommunityProfileAction(): Promise<
  CommunityResult<MyCommunityProfile>
> {
  try {
    const userId = await getCurrentUserId();
    return { ok: true, data: await getMyCommunityProfile(userId) };
  } catch (error) {
    return failure(
      error,
      "getMyCommunityProfile",
      await communityActionText(undefined, "getMyCommunityProfile"),
    );
  }
}

const profileSchema = z.object({
  handle: z.string().max(64),
  displayName: z.string().max(200),
  showPicture: z.boolean(),
});

/** Saves the viewer's profile from Settings: in the app's language. */
export async function saveCommunityProfileAction(
  input: z.input<typeof profileSchema>,
): Promise<CommunityResult<{ handle: string | null }>> {
  const text = lazyCommunityText(undefined, "saveCommunityProfile");
  try {
    const userId = await getCurrentUserId();
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", (await text()).actions.checkDetails);
    }
    return { ok: true, data: await saveCommunityProfile(userId, parsed.data) };
  } catch (error) {
    return failure(error, "saveCommunityProfile", await text());
  }
}
