"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  currentSession,
  requireRecentConfirmation,
} from "@/lib/account/confirmation-server";
import { setTeamNotes } from "@/lib/email/team-notes";
import { HttpError } from "@/lib/error-response";
import {
  addChatTarget,
  chatEventsSchema,
  notificationEventsSchema,
  removeChatTarget,
  sendTestChatMessage,
  setEmailEvents,
  updateChatTarget,
} from "@/lib/events/notification-settings";
import { settingsActionText } from "@/lib/i18n/settings-action-text";
import { enforceRateLimits } from "@/lib/request-guards";
import { getCurrentUserId, logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

// Refusals of its own are in the person's language
// (settingsActions.notifications). The settings' own checks and plan limits
// (lib/events/notification-settings.ts) are English: the upgrade prompt
// below reads which plan from that English.

export type NotificationActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; upgrade?: "pro" | "business" };

const mutationLimiter = createRateLimiter({
  limiter: slidingWindow(30, "60 s"),
});
const testLimiter = createRateLimiter({ limiter: slidingWindow(5, "60 s") });

const workspaceSchema = z.string().trim().min(1).max(128).nullable();
const idSchema = z.string().trim().min(1).max(64);

const emailSchema = z.object({
  organizationId: workspaceSchema,
  events: notificationEventsSchema,
});
const addSchema = z.object({
  organizationId: workspaceSchema,
  channel: z.enum(["slack", "discord"]),
  // Its key in settingsActions.notifications.
  url: z.string().trim().min(1, "webhookUrlMissing").max(2048),
  events: chatEventsSchema,
});
const updateSchema = z.object({ id: idSchema, events: chatEventsSchema });
const targetSchema = z.object({ id: idSchema });
const teamNotesSchema = z.object({ on: z.boolean() });

async function failure(
  error: unknown,
  action: string,
): Promise<NotificationActionResult<never>> {
  const text = settingsActionText("settingsActions.notifications");
  if (error instanceof UnauthorizedError) {
    return { ok: false, error: (await text())("signedOut") };
  }
  if (error instanceof HttpError) {
    if (error.code === "RATE_LIMITED") {
      return { ok: false, error: (await text())("rateLimited") };
    }
    if (error.status === 402) {
      return {
        ok: false,
        error: error.message,
        upgrade: /Business/.test(error.message) ? "business" : "pro",
      };
    }
    return { ok: false, error: error.message };
  }
  logError(error as Error, { action });
  return { ok: false, error: (await text())("failed") };
}

async function run<T>(
  action: string,
  limiter: typeof mutationLimiter,
  body: (userId: string) => Promise<T>,
  { confirm = false }: { confirm?: boolean } = {},
): Promise<NotificationActionResult<T>> {
  try {
    const userId = await getCurrentUserId();
    // Before the limits, so the round trip that asks doesn't use one up.
    if (confirm) {
      const session = await currentSession();
      if (!session || session.userId !== userId) throw new UnauthorizedError();
      const needed = await requireRecentConfirmation(session);
      if (needed) return needed;
    }
    await enforceRateLimits([
      { limiter, key: `notifications:${action}:${userId}` },
    ]);
    const data = await body(userId);
    revalidatePath("/settings/notifications");
    return { ok: true, data };
  } catch (error) {
    return await failure(error, action);
  }
}

// Only an empty webhook URL gets past the form; anything else is a request
// it never sends, answered in zod's own words, as before.
async function invalid(
  error: z.ZodError,
): Promise<NotificationActionResult<never>> {
  const issue = error.issues[0]?.message;
  if (issue === "webhookUrlMissing") {
    const t = await settingsActionText("settingsActions.notifications")();
    return { ok: false, error: t("webhookUrlMissing") };
  }
  return { ok: false, error: issue ?? "Invalid input." };
}

export async function setNotificationEmailEvents(input: {
  organizationId: string | null;
  events: string[];
}): Promise<NotificationActionResult> {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return await invalid(parsed.error);
  return run("email", mutationLimiter, async (userId) => {
    await setEmailEvents(
      userId,
      parsed.data.organizationId,
      parsed.data.events,
    );
    return null;
  });
}

export async function addNotificationWebhook(input: {
  organizationId: string | null;
  channel: "slack" | "discord";
  url: string;
  events: string[];
}): Promise<NotificationActionResult<{ id: string }>> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return await invalid(parsed.error);
  const { organizationId, ...target } = parsed.data;
  // Notifications going to a new address: "Confirm it's you" first. Editing
  // which events go to an existing one doesn't ask.
  return run(
    "add",
    mutationLimiter,
    (userId) => addChatTarget(userId, organizationId, target),
    { confirm: true },
  );
}

export async function updateNotificationWebhook(input: {
  id: string;
  events: string[];
}): Promise<NotificationActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return await invalid(parsed.error);
  return run("update", mutationLimiter, async (userId) => {
    await updateChatTarget(userId, parsed.data.id, parsed.data.events);
    return null;
  });
}

export async function removeNotificationWebhook(input: {
  id: string;
}): Promise<NotificationActionResult> {
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return await invalid(parsed.error);
  return run("remove", mutationLimiter, async (userId) => {
    await removeChatTarget(userId, parsed.data.id);
    return null;
  });
}

export async function testNotificationWebhook(input: {
  id: string;
}): Promise<NotificationActionResult> {
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return await invalid(parsed.error);
  return run("test", testLimiter, async (userId) => {
    await sendTestChatMessage(userId, parsed.data.id);
    return null;
  });
}

/** Notes from the QRdx team (lib/email/team-notes.ts): on or off. */
export async function setTeamNotesPreference(input: {
  on: boolean;
}): Promise<NotificationActionResult> {
  const parsed = teamNotesSchema.safeParse(input);
  if (!parsed.success) return await invalid(parsed.error);
  return run("team-notes", mutationLimiter, async (userId) => {
    await setTeamNotes(userId, parsed.data.on);
    return null;
  });
}
