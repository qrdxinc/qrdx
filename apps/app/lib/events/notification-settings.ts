import "server-only";

import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import {
  database as db,
  member,
  notificationSetting,
  organization,
  user,
} from "@repo/database";
import cuid from "cuid";
import { and, asc, eq, isNull, type SQL } from "drizzle-orm";
import { z } from "zod";
import { HttpError } from "@/lib/error-response";
import type { Translator } from "@/lib/i18n/translator";
import { baseUrl } from "@/lib/metadata";
import { getPlanForScope, getPlanLimits, type Plan } from "@/lib/plans";
import { assertNotShutOut } from "@/lib/workspaces";
import { postChatMessage } from "./notify";
import {
  invalidateSubscribers,
  parseDefaultEmailTargetId,
} from "./subscribers";
import {
  CHAT_NOTIFICATION_EVENTS,
  DEFAULT_EMAIL_EVENTS,
  MAX_CHAT_TARGETS,
  NOTIFICATION_EVENTS,
  type NotificationEvent,
} from "./types";
import type { UnsubscribeScope } from "./unsubscribe";
import {
  checkDiscordWebhookUrl,
  checkSlackWebhookUrl,
  maskChatWebhookUrl,
  WEBHOOK_URL_PROBLEMS,
  type WebhookUrlProblem,
} from "./url-safety";

// notification_setting rows belong to one person and one workspace
// (organization_id null = personal). Each person has at most one email row
// per workspace (always their own account address) plus Slack / Discord
// incoming-webhook targets. No email row means the plan's defaults
// (DEFAULT_EMAIL_EVENTS for the codes the person made, on plans with email
// alerts), so turning email off keeps a row with no events.

export type ChatChannel = "slack" | "discord";

/**
 * What the settings refuse with, in English: what logs and anything that
 * shows errors as they are get. Settings > Notifications says them in the
 * person's language (notificationSettingsMessages), and
 * tests/i18n/notification-settings.test.ts keeps the catalog's copies equal.
 */
export const NOTIFICATION_SETTINGS_MESSAGES = {
  notMember: "You're not a member of that workspace.",
  emailAlertsPro: "Email alerts and the weekly digest are part of Pro.",
  chatBusiness: "Slack and Discord alerts are part of the Business plan.",
  accountNotFound: "Account not found.",
  webhookAlreadyAdded: "That webhook is already added.",
  tooManyWebhooks: (max: number) =>
    `Add up to ${max} Slack or Discord webhooks per workspace.`,
  targetNotFound: "Notification target not found.",
  notDelivered: (error: string) => `Not delivered: ${error}`,
  pickEvent: "Pick at least one event",
  url: WEBHOOK_URL_PROBLEMS,
} satisfies NotificationSettingsMessages;

/** NOTIFICATION_SETTINGS_MESSAGES in any language. */
export interface NotificationSettingsMessages {
  notMember: string;
  emailAlertsPro: string;
  chatBusiness: string;
  accountNotFound: string;
  webhookAlreadyAdded: string;
  tooManyWebhooks: (max: number) => string;
  targetNotFound: string;
  /** `error` is the delivery's own detail, as it came */
  notDelivered: (error: string) => string;
  pickEvent: string;
  url: Record<WebhookUrlProblem, string>;
}

/**
 * NOTIFICATION_SETTINGS_MESSAGES in t's language
 * (settingsActions.notifications in messages/en.json), for the actions'
 * answers.
 */
export function notificationSettingsMessages(
  t: Translator<"settingsActions.notifications">,
): NotificationSettingsMessages {
  return {
    notMember: t("notMember"),
    emailAlertsPro: t("emailAlertsPro"),
    chatBusiness: t("chatBusiness"),
    accountNotFound: t("accountNotFound"),
    webhookAlreadyAdded: t("webhookAlreadyAdded"),
    tooManyWebhooks: (max) => t("tooManyWebhooks", { max }),
    targetNotFound: t("targetNotFound"),
    notDelivered: (error) => t("notDelivered", { error }),
    pickEvent: t("pickEvent"),
    url: {
      missing: t("url.missing"),
      tooLong: t("url.tooLong"),
      notFull: t("url.notFull"),
      notHttps: t("url.notHttps"),
      credentials: t("url.credentials"),
      ipAddress: t("url.ipAddress"),
      notPublic: t("url.notPublic"),
      notSlack: t("url.notSlack"),
      notDiscord: t("url.notDiscord"),
    },
  };
}

/**
 * What the settings refuse with: `message` is the English, `messageIn` says
 * it in another language, and `plan` is the plan a PLAN_REQUIRED refusal
 * needs (the upgrade Settings offers).
 */
export class NotificationSettingsError extends HttpError {
  readonly plan?: "pro" | "business";
  private readonly say: (messages: NotificationSettingsMessages) => string;

  constructor(
    status: number,
    code: string,
    say: (messages: NotificationSettingsMessages) => string,
    plan?: "pro" | "business",
  ) {
    super(status, code, say(NOTIFICATION_SETTINGS_MESSAGES));
    this.name = "NotificationSettingsError";
    this.plan = plan;
    this.say = say;
  }

  /** The message from `messages` (another language's set). */
  messageIn(messages: NotificationSettingsMessages): string {
    return this.say(messages);
  }
}

const emailAlertsNeedPro = () =>
  new NotificationSettingsError(
    402,
    "PLAN_REQUIRED",
    (m) => m.emailAlertsPro,
    "pro",
  );

const chatNeedsBusiness = () =>
  new NotificationSettingsError(
    402,
    "PLAN_REQUIRED",
    (m) => m.chatBusiness,
    "business",
  );

export const notificationEventsSchema = z
  .array(z.enum(NOTIFICATION_EVENTS))
  .max(NOTIFICATION_EVENTS.length)
  .transform((events) => [...new Set(events)]);

export const chatEventsSchema = z
  .array(z.enum(NOTIFICATION_EVENTS))
  .min(1, NOTIFICATION_SETTINGS_MESSAGES.pickEvent)
  .max(NOTIFICATION_EVENTS.length)
  .transform((events) => [
    ...new Set(
      events.filter((event) => CHAT_NOTIFICATION_EVENTS.includes(event)),
    ),
  ])
  .refine(
    (events) => events.length > 0,
    NOTIFICATION_SETTINGS_MESSAGES.pickEvent,
  );

export interface NotificationWorkspace {
  organizationId: string | null;
  name: string;
  /** The person's own workspace (its plan is their own) */
  own: boolean;
  plan: Plan;
  emailAlerts: boolean;
  chat: boolean;
  email: { id: string; events: NotificationEvent[] } | null;
  /**
   * No email row on a plan with email alerts: DEFAULT_EMAIL_EVENTS go out
   * for the codes the person made. False once they have a row, or without
   * email alerts.
   */
  emailByDefault: boolean;
  chats: {
    id: string;
    channel: ChatChannel;
    label: string;
    events: NotificationEvent[];
    createdAt: Date;
  }[];
}

const asEvents = (value: unknown): NotificationEvent[] =>
  Array.isArray(value)
    ? value.filter((event): event is NotificationEvent =>
        (NOTIFICATION_EVENTS as readonly string[]).includes(event),
      )
    : [];

function workspaceWhere(userId: string, organizationId: string | null): SQL {
  return and(
    eq(notificationSetting.userId, userId),
    organizationId
      ? eq(notificationSetting.organizationId, organizationId)
      : isNull(notificationSetting.organizationId),
  ) as SQL;
}

const scopeOf = (userId: string, organizationId: string | null) => ({
  userId,
  organizationId,
});

/**
 * The person is a member of the workspace, and it doesn't shut them out
 * ("Require two-step verification"): without it on they can't send the
 * workspace's events anywhere new, by email or chat (lib/workspaces.ts).
 */
async function assertMember(userId: string, organizationId: string | null) {
  if (!organizationId) return;
  if (!(await isMember(userId, organizationId))) {
    throw new NotificationSettingsError(403, "FORBIDDEN", (m) => m.notMember);
  }
  await assertNotShutOut(userId, organizationId);
}

async function planFor(userId: string, organizationId: string | null) {
  const limits = getPlanLimits(
    await getPlanForScope(scopeOf(userId, organizationId)),
  );
  return { emailAlerts: limits.emailAlerts, chat: limits.webhooks };
}

/** Every workspace the person belongs to, their own first. */
export async function listNotificationWorkspaces(
  userId: string,
): Promise<NotificationWorkspace[]> {
  const [teams, settings] = await db.batch([
    db
      .select({ id: organization.id, name: organization.name })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(eq(member.userId, userId))
      .orderBy(asc(organization.name)),
    db
      .select()
      .from(notificationSetting)
      .where(eq(notificationSetting.userId, userId))
      .orderBy(asc(notificationSetting.createdAt)),
  ]);

  // Your own workspace first, then the others by name.
  const own = ownWorkspaceId(userId);
  const scopes: { organizationId: string | null; name: string }[] = [
    ...teams.filter((team) => team.id === own),
    ...teams.filter((team) => team.id !== own),
  ].map((team) => ({ organizationId: team.id, name: team.name }));

  return Promise.all(
    scopes.map(async ({ organizationId, name }) => {
      const plan = await getPlanForScope(scopeOf(userId, organizationId));
      const limits = getPlanLimits(plan);
      const rows = settings.filter(
        (row) => row.organizationId === organizationId,
      );
      const emailRow = rows.find((row) => row.channel === "email");
      return {
        organizationId,
        name,
        own: organizationId === own,
        plan,
        emailAlerts: limits.emailAlerts,
        chat: limits.webhooks,
        email: emailRow
          ? { id: emailRow.id, events: asEvents(emailRow.events) }
          : null,
        emailByDefault: !emailRow && limits.emailAlerts,
        chats: rows
          .filter((row) => row.channel !== "email")
          .map((row) => ({
            id: row.id,
            channel: row.channel as ChatChannel,
            label: maskChatWebhookUrl(row.target),
            events: asEvents(row.events),
            createdAt: row.createdAt,
          })),
      };
    }),
  );
}

/**
 * Replaces the person's email events for a workspace ([] turns email off,
 * which always works, even after a downgrade: it keeps a row with no
 * events, since no row means the plan's defaults).
 */
export async function setEmailEvents(
  userId: string,
  organizationId: string | null,
  events: NotificationEvent[],
): Promise<void> {
  if (events.length === 0) {
    // Only for a workspace the person is in: no row elsewhere.
    if (organizationId && !(await isMember(userId, organizationId))) return;
    await saveEmailEvents(userId, organizationId, []);
    return;
  }
  await assertMember(userId, organizationId);
  if (!(await planFor(userId, organizationId)).emailAlerts) {
    throw emailAlertsNeedPro();
  }
  await saveEmailEvents(userId, organizationId, events);
}

async function isMember(userId: string, organizationId: string) {
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
    )
    .limit(1);
  return Boolean(row);
}

/** Writes the person's one email row for the workspace (no checks). */
async function saveEmailEvents(
  userId: string,
  organizationId: string | null,
  events: NotificationEvent[],
): Promise<void> {
  const where = and(
    workspaceWhere(userId, organizationId),
    eq(notificationSetting.channel, "email"),
  );
  const [account] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!account) {
    throw new NotificationSettingsError(
      404,
      "NOT_FOUND",
      (m) => m.accountNotFound,
    );
  }

  const existing = await db
    .select({ id: notificationSetting.id })
    .from(notificationSetting)
    .where(where);
  const [first, ...duplicates] = existing;
  if (first) {
    await db
      .update(notificationSetting)
      .set({ events, target: account.email })
      .where(eq(notificationSetting.id, first.id));
    for (const duplicate of duplicates) {
      await db
        .delete(notificationSetting)
        .where(eq(notificationSetting.id, duplicate.id));
    }
  } else {
    await db.insert(notificationSetting).values({
      id: cuid(),
      userId,
      organizationId,
      channel: "email",
      target: account.email,
      events,
    });
  }
  invalidateSubscribers(scopeOf(userId, organizationId));
}

export function checkChatUrl(channel: ChatChannel, url: string): string {
  const checked =
    channel === "slack"
      ? checkSlackWebhookUrl(url)
      : checkDiscordWebhookUrl(url);
  if (!checked.ok) {
    const { problem } = checked;
    throw new NotificationSettingsError(
      400,
      "VALIDATION_ERROR",
      (m) => m.url[problem],
    );
  }
  return checked.url.toString();
}

export async function addChatTarget(
  userId: string,
  organizationId: string | null,
  input: { channel: ChatChannel; url: string; events: NotificationEvent[] },
): Promise<{ id: string }> {
  await assertMember(userId, organizationId);
  if (!(await planFor(userId, organizationId)).chat) {
    throw chatNeedsBusiness();
  }
  const url = checkChatUrl(input.channel, input.url);
  const rows = await db
    .select({
      id: notificationSetting.id,
      target: notificationSetting.target,
      channel: notificationSetting.channel,
    })
    .from(notificationSetting)
    .where(workspaceWhere(userId, organizationId));
  const chats = rows.filter((row) => row.channel !== "email");
  if (chats.some((row) => row.target === url)) {
    throw new NotificationSettingsError(
      409,
      "ALREADY_EXISTS",
      (m) => m.webhookAlreadyAdded,
    );
  }
  if (chats.length >= MAX_CHAT_TARGETS) {
    throw new NotificationSettingsError(403, "LIMIT_REACHED", (m) =>
      m.tooManyWebhooks(MAX_CHAT_TARGETS),
    );
  }
  const id = cuid();
  await db.insert(notificationSetting).values({
    id,
    userId,
    organizationId,
    channel: input.channel,
    target: url,
    events: input.events,
  });
  invalidateSubscribers(scopeOf(userId, organizationId));
  return { id };
}

async function findOwnChatTarget(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(notificationSetting)
    .where(
      and(
        eq(notificationSetting.id, id),
        eq(notificationSetting.userId, userId),
      ),
    )
    .limit(1);
  if (!row || row.channel === "email") {
    throw new NotificationSettingsError(
      404,
      "NOT_FOUND",
      (m) => m.targetNotFound,
    );
  }
  return row;
}

export async function updateChatTarget(
  userId: string,
  id: string,
  events: NotificationEvent[],
): Promise<void> {
  const row = await findOwnChatTarget(userId, id);
  // More events to a webhook is sending more of the workspace somewhere.
  await assertMember(userId, row.organizationId);
  if (!(await planFor(userId, row.organizationId)).chat) {
    throw chatNeedsBusiness();
  }
  await db
    .update(notificationSetting)
    .set({ events })
    .where(eq(notificationSetting.id, id));
  invalidateSubscribers(scopeOf(userId, row.organizationId));
}

/** Removing is allowed on every plan. */
export async function removeChatTarget(userId: string, id: string) {
  const row = await findOwnChatTarget(userId, id);
  await db.delete(notificationSetting).where(eq(notificationSetting.id, id));
  invalidateSubscribers(scopeOf(userId, row.organizationId));
}

export async function sendTestChatMessage(userId: string, id: string) {
  const row = await findOwnChatTarget(userId, id);
  if (!(await planFor(userId, row.organizationId)).chat) {
    throw chatNeedsBusiness();
  }
  const result = await postChatMessage(row.channel as ChatChannel, row.target, {
    text: "Test notification from QRdx. Alerts you picked will show up here.",
    url: new URL("/settings/notifications", baseUrl.origin).toString(),
  });
  if (!result.ok) {
    const { error } = result;
    throw new NotificationSettingsError(502, "DELIVERY_FAILED", (m) =>
      m.notDelivered(error),
    );
  }
}

/**
 * Unsubscribe link handler: removes the event (or every event) from an email
 * setting, keeping the row when nothing is left (no row would mean the
 * plan's defaults). A default recipient's link (no row yet) saves one: the
 * defaults without the event. Idempotent.
 */
export async function applyUnsubscribe(
  settingId: string,
  event: UnsubscribeScope,
): Promise<{ found: boolean }> {
  const byDefault = parseDefaultEmailTargetId(settingId);
  if (byDefault) {
    const { userId, organizationId } = byDefault;
    // Someone who left the workspace gets nothing from it anyway.
    if (organizationId && !(await isMember(userId, organizationId))) {
      return { found: false };
    }
    const [current] = await db
      .select({ events: notificationSetting.events })
      .from(notificationSetting)
      .where(
        and(
          workspaceWhere(userId, organizationId),
          eq(notificationSetting.channel, "email"),
        ),
      )
      .limit(1);
    const from = current ? asEvents(current.events) : [...DEFAULT_EMAIL_EVENTS];
    await saveEmailEvents(
      userId,
      organizationId,
      event === "all" ? [] : from.filter((item) => item !== event),
    );
    return { found: true };
  }
  const [row] = await db
    .select()
    .from(notificationSetting)
    .where(eq(notificationSetting.id, settingId))
    .limit(1);
  if (row?.channel !== "email") return { found: false };
  const remaining =
    event === "all"
      ? []
      : asEvents(row.events).filter((item) => item !== event);
  await db
    .update(notificationSetting)
    .set({ events: remaining })
    .where(eq(notificationSetting.id, row.id));
  invalidateSubscribers(scopeOf(row.userId, row.organizationId));
  return { found: true };
}
