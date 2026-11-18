"use server";

import { isOwnWorkspaceOf } from "@repo/auth/own-workspace-id";
import { database as db, qrPreset as themeTable } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import cuid from "cuid";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { z } from "zod";
import {
  QR_THEME_MESSAGES,
  type QrThemeMessages,
  qrThemeMessages,
} from "@/app/(app)/dashboard/themes/_lib/action-messages";
import {
  canEditTheme,
  canManageTeamThemes,
  countThemesInScope,
  findThemeById,
  isPersonalTheme,
  listVisibleThemes,
  ownerScope,
  setOnlyDefaultTheme,
  teamThemesPlanName,
  themeScopeWhere,
} from "@/app/(app)/dashboard/themes/_lib/queries";
import type {
  SavedTheme,
  ThemeActionResult,
} from "@/app/(app)/dashboard/themes/_lib/theme";
import { actionText } from "@/lib/i18n/action-locale";
import { noteLimitUsage } from "@/lib/limit-notices";
import { can } from "@/lib/permissions";
import { getPlan, getPlanForScope, getPlanLimits } from "@/lib/plans";
import { getActiveScope } from "@/lib/scope";
import { getCurrentUserId, logError } from "@/lib/shared";
import { ensureOwnWorkspaceFor } from "@/lib/workspaces";
import {
  actionError,
  actionSuccess,
  ErrorCode,
  QRCodeThemeNotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/types/errors";
import { type ThemeStyles, themeStylePropsSchema } from "@/types/theme";

const mutationLimiter = createRateLimiter({
  limiter: slidingWindow(30, "60 s"),
});

const nameSchema = z
  .string()
  .trim()
  .min(1, "Theme name cannot be empty")
  .max(50, "Theme name too long");
const idSchema = z.string().trim().min(1, "Theme ID required").max(64);

const createThemeSchema = z.object({
  name: nameSchema,
  style: themeStylePropsSchema,
});

const updateThemeSchema = z.object({
  id: idSchema,
  name: nameSchema.optional(),
  styles: themeStylePropsSchema.optional(),
});

// What's thrown (ValidationError and the like) is never shown as it is:
// Next.js hides a server action's error message in production. What's
// returned is shown, in the language of the page that asked
// (lib/i18n/action-locale.ts): the editor sends its own (`pageLocale`), the
// dashboard's Themes page gets the app's.
const TOO_MANY = QR_THEME_MESSAGES.tooMany;

/**
 * QR_THEME_MESSAGES in the page's language; English, logged, if unreadable.
 * `userId`: who's asking, when the action knows (no second session read).
 */
const themeText = (
  action: string,
  { pageLocale, userId }: { pageLocale?: unknown; userId?: string } = {},
) =>
  actionText<QrThemeMessages>(
    QR_THEME_MESSAGES,
    async (locale) =>
      qrThemeMessages(
        await getTranslations({
          locale,
          namespace: "communityActions.qrThemes",
        }),
      ),
    { pageLocale, userId, action: `qrThemes.${action}` },
  );

/** Expected errors (signed out, bad input, not found) aren't worth reporting. */
function report(error: unknown, context: Record<string, unknown>) {
  if (
    error instanceof UnauthorizedError ||
    error instanceof ValidationError ||
    error instanceof QRCodeThemeNotFoundError
  ) {
    return;
  }
  logError(error as Error, context);
}

function fail(error: string, upgrade = false): ThemeActionResult<never> {
  return upgrade ? { ok: false, error, upgrade } : { ok: false, error };
}

async function failure(
  error: unknown,
  action: string,
): Promise<ThemeActionResult<never>> {
  const m = await themeText(action);
  if (error instanceof UnauthorizedError) return fail(m.signIn);
  report(error, { action });
  return fail(m.failed);
}

async function allowMutation(userId: string): Promise<boolean> {
  const { success } = await mutationLimiter.limit(`themes:${userId}`);
  return success;
}

function revalidate() {
  revalidatePath("/dashboard", "layout");
}

/**
 * Themes the signed-in user can pick from: their own plus, in another
 * workspace, its shared themes. Empty when signed out.
 */
export async function getThemes(): Promise<SavedTheme[]> {
  try {
    return await listVisibleThemes(await getActiveScope());
  } catch (error) {
    if (error instanceof UnauthorizedError) return [];
    report(error, { action: "getThemes" });
    throw error;
  }
}

/** Public by id: saved themes are shared as /playground/<id> links. */
export const getTheme = cache(async (themeId: string) => {
  try {
    const parsed = idSchema.safeParse(themeId);
    if (!parsed.success) throw new QRCodeThemeNotFoundError();

    const [theme] = await db
      .select()
      .from(themeTable)
      .where(eq(themeTable.id, parsed.data))
      .limit(1);
    if (!theme) throw new QRCodeThemeNotFoundError();

    return theme;
  } catch (error) {
    report(error, { action: "getTheme", themeId });
    throw error;
  }
});

/**
 * Saves one of your themes, in your own workspace (Free: up to the plan's
 * saved-theme limit). Owners and admins share it with another workspace
 * with copyThemeToTeam. The editor calls it, with its language
 * (`pageLocale`) for the limit message.
 */
export async function createTheme(
  formData: {
    name: string;
    style: ThemeStyles;
  },
  pageLocale?: string,
) {
  try {
    const userId = await getCurrentUserId();

    const validation = createThemeSchema.safeParse(formData);
    if (!validation.success) {
      throw new ValidationError("Invalid input", validation.error.format());
    }
    if (!(await allowMutation(userId))) throw new ValidationError(TOO_MANY);

    const own = await ensureOwnWorkspaceFor(userId);
    const personal = { userId, organizationId: own.id };
    const limit = getPlanLimits(await getPlan(userId)).savedThemes;
    const limitReached = async () =>
      actionError(
        ErrorCode.THEME_LIMIT_REACHED,
        (await themeText("createTheme", { pageLocale, userId })).themeLimit({
          limit,
        }),
      );
    if ((await countThemesInScope(personal)) >= limit) return limitReached();

    const { name, style } = validation.data;
    const now = new Date();
    const [insertedTheme] = await db
      .insert(themeTable)
      .values({
        id: cuid(),
        userId,
        organizationId: own.id,
        name,
        style,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Concurrent saves can both pass the check above; keep only what the plan allows.
    if (Number.isFinite(limit)) {
      const used = await countThemesInScope(personal);
      if (used > limit) {
        await db.delete(themeTable).where(eq(themeTable.id, insertedTheme.id));
        return limitReached();
      }
      // You hear about it at 90% and 100% (after the response).
      noteLimitUsage(personal, "savedThemes", { used, limit });
    }

    revalidate();
    return actionSuccess(insertedTheme);
  } catch (error) {
    report(error, { action: "createTheme" });
    throw error;
  }
}

/** Editing is always allowed, even over the plan limit (e.g. after a downgrade). */
export async function updateTheme(formData: {
  id: string;
  name?: string;
  styles?: ThemeStyles;
}) {
  try {
    const scope = await getActiveScope();

    const validation = updateThemeSchema.safeParse(formData);
    if (!validation.success) {
      throw new ValidationError("Invalid input", validation.error.format());
    }
    const { id: themeId, name, styles } = validation.data;
    if (!name && !styles) {
      throw new ValidationError("No update data provided");
    }
    if (!(await allowMutation(scope.userId))) {
      throw new ValidationError(TOO_MANY);
    }

    const theme = await findThemeById(themeId);
    if (!theme || !canEditTheme(scope, theme)) {
      throw new QRCodeThemeNotFoundError(
        "Theme not found or you can't edit it",
      );
    }

    const updateData: Partial<typeof themeTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (name) updateData.name = name;
    if (styles) updateData.style = styles;

    const [updatedTheme] = await db
      .update(themeTable)
      .set(updateData)
      .where(
        and(eq(themeTable.id, themeId), themeScopeWhere(ownerScope(theme))),
      )
      .returning();
    if (!updatedTheme) throw new QRCodeThemeNotFoundError();

    revalidate();
    return updatedTheme;
  } catch (error) {
    report(error, { action: "updateTheme", themeId: formData.id });
    throw error;
  }
}

export async function deleteTheme(themeId: string) {
  try {
    const scope = await getActiveScope();

    const parsed = idSchema.safeParse(themeId);
    if (!parsed.success) throw new ValidationError("Theme ID required");
    if (!(await allowMutation(scope.userId))) {
      throw new ValidationError(TOO_MANY);
    }

    const theme = await findThemeById(parsed.data);
    if (!theme || !canEditTheme(scope, theme)) {
      throw new QRCodeThemeNotFoundError(
        "Theme not found or you can't delete it",
      );
    }

    const [deletedTheme] = await db
      .delete(themeTable)
      .where(
        and(eq(themeTable.id, parsed.data), themeScopeWhere(ownerScope(theme))),
      )
      .returning({ id: themeTable.id, name: themeTable.name });
    if (!deletedTheme) throw new QRCodeThemeNotFoundError();

    revalidate();
    return deletedTheme;
  } catch (error) {
    report(error, { action: "deleteTheme", themeId });
    throw error;
  }
}

/**
 * Sets (or clears) the default theme of the theme's own scope: new dynamic
 * codes and fresh playground sessions in that workspace start from it.
 */
export async function setDefaultTheme(
  themeId: string,
  isDefault: boolean,
): Promise<ThemeActionResult<{ id: string }>> {
  try {
    const scope = await getActiveScope();
    const text = () => themeText("setDefaultTheme", { userId: scope.userId });
    const parsed = idSchema.safeParse(themeId);
    if (!parsed.success || typeof isDefault !== "boolean") {
      return fail((await text()).notFound);
    }
    if (!(await allowMutation(scope.userId))) {
      return fail((await text()).tooMany);
    }

    const theme = await findThemeById(parsed.data);
    if (!theme || !canEditTheme(scope, theme)) {
      const m = await text();
      return fail(
        theme && !isPersonalTheme(theme, scope.userId)
          ? m.defaultAdminsOnly
          : m.notFound,
      );
    }

    if (isDefault) {
      await setOnlyDefaultTheme(ownerScope(theme), theme.id);
    } else {
      await db
        .update(themeTable)
        .set({ isDefault: false })
        .where(eq(themeTable.id, theme.id));
    }

    revalidate();
    return { ok: true, data: { id: theme.id } };
  } catch (error) {
    return failure(error, "setDefaultTheme");
  }
}

/** Copies one of your themes into the open workspace's shared themes. */
export async function copyThemeToTeam(
  themeId: string,
): Promise<ThemeActionResult<{ id: string }>> {
  try {
    const scope = await getActiveScope();
    const text = () => themeText("copyThemeToTeam", { userId: scope.userId });
    const parsed = idSchema.safeParse(themeId);
    if (!parsed.success) return fail((await text()).notFound);
    if (isOwnWorkspaceOf(scope.organizationId, scope.userId)) {
      return fail((await text()).openAnotherWorkspace);
    }
    if (!canManageTeamThemes(scope)) {
      return fail((await text()).shareAdminsOnly);
    }
    if (!(await allowMutation(scope.userId))) {
      return fail((await text()).tooMany);
    }

    const limits = getPlanLimits(await getPlanForScope(scope));
    if (!limits.teamThemes) {
      return fail(
        (await text()).sharedThemesPlan({ plan: teamThemesPlanName() }),
        can(scope.role, "billing.manage"),
      );
    }
    if (
      Number.isFinite(limits.savedThemes) &&
      (await countThemesInScope(scope)) >= limits.savedThemes
    ) {
      return fail(
        (await text()).workspaceThemeLimit({ count: limits.savedThemes }),
      );
    }

    const theme = await findThemeById(parsed.data);
    if (
      !theme ||
      theme.userId !== scope.userId ||
      !isPersonalTheme(theme, scope.userId)
    ) {
      return fail((await text()).notFound);
    }

    const id = cuid();
    const now = new Date();
    await db.insert(themeTable).values({
      id,
      userId: scope.userId,
      organizationId: scope.organizationId,
      name: theme.name,
      style: theme.style,
      createdAt: now,
      updatedAt: now,
    });
    // Owners hear about it at 90% and 100% (after the response).
    if (Number.isFinite(limits.savedThemes)) {
      noteLimitUsage(scope, "savedThemes");
    }

    revalidate();
    return { ok: true, data: { id } };
  } catch (error) {
    return failure(error, "copyThemeToTeam");
  }
}
