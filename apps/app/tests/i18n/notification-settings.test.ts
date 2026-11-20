// What Settings > Notifications refuses with, in another language: the
// notification settings (lib/events/notification-settings.ts) throw English,
// for logs and anything that shows errors as they are, and the page's
// actions (app/(app)/settings/notifications/_lib/actions.ts) say it again in
// the person's language, offering the upgrade the refusal carries, never one
// read from its words. That language is the app's rule
// (lib/i18n/app-locale.ts, run for real here): the saved one, else the
// language menu's cookie, else English. Only next-intl's server entry, which
// needs Next's plugin, is swapped for what i18n/request.ts does: the
// locale's catalog over English. The settings, the confirmation and the
// tables are the real ones (tests/support/fake-db.ts); the plan, the
// two-step requirement and Slack are the test's.
// Also: the catalog's copies of the English constants.

import type { Locale } from "@repo/i18n/config";
import { mergeMessages } from "@repo/i18n/messages";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import { fakeDb } from "../support/fake-db";

type Plan = "free" | "pro" | "business";
type Notifications = Record<string, unknown>;

const state = vi.hoisted(() => ({
  /** The signed-in person, if anyone */
  userId: null as string | null,
  /** The language menu's cookie (NEXT_LOCALE), if any */
  cookieLocale: undefined as string | undefined,
  /** next-intl can't load a catalog */
  intlBroken: false,
  /** Rewords settingsActions.notifications in every catalog read */
  reword: null as null | ((notifications: Notifications) => Notifications),
  plan: "free" as "free" | "pro" | "business",
  /** The workspace requires two-step verification, which the person lacks */
  shutOut: false,
  /** What posting the test message to Slack or Discord answers */
  delivery: { ok: true } as { ok: true } | { ok: false; error: string },
  errors: [] as string[],
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/headers", async () => {
  const { LOCALE_COOKIE: localeCookie } = await import("@repo/i18n/config");
  return {
    headers: async () => new Headers({ host: "localhost:3000" }),
    cookies: async () => ({
      get: (name: string) =>
        name === localeCookie && state.cookieLocale !== undefined
          ? { name, value: state.cookieLocale }
          : undefined,
      set: () => {},
    }),
  };
});
// What i18n/request.ts gives getTranslations: the locale's catalog over
// English.
vi.mock("next-intl/server", async () => {
  const { createTranslator: translator } = await import("next-intl");
  const { loadMessages } = await import("@/lib/i18n/messages");
  return {
    getTranslations: async ({
      locale,
      namespace,
    }: {
      locale: Locale;
      namespace?: string;
    }) => {
      if (state.intlBroken) throw new Error("no catalog");
      const messages = await loadMessages(locale);
      const reword = state.reword;
      return translator({
        locale,
        messages: reword
          ? ({
              ...messages,
              settingsActions: {
                ...messages.settingsActions,
                notifications: reword(messages.settingsActions.notifications),
              },
            } as typeof messages)
          : messages,
        namespace: namespace as never,
      });
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
}));
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () =>
        state.userId
          ? {
              user: { id: state.userId, email: "ada@qrdx.test" },
              session: { id: "session_1", createdAt: new Date() },
            }
          : null,
    },
  },
}));
vi.mock("@/lib/account/reauth", () => ({ signInCodesAvailable: () => true }));
vi.mock("@/lib/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shared")>()),
  logError: (error: Error, context?: { action?: string }) => {
    state.errors.push(`${context?.action}: ${error.message}`);
  },
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
}));
// The requirement itself is tests/lib/workspace-shut-out.test.ts.
vi.mock("@/lib/workspaces", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workspaces")>();
  return {
    ...actual,
    assertNotShutOut: async () => {
      if (state.shutOut) throw new actual.TwoFactorRequiredError();
    },
  };
});
vi.mock("@/lib/events/notify", () => ({
  postChatMessage: async () => state.delivery,
}));

const notifications = await import(
  "@/app/(app)/settings/notifications/_lib/actions"
);
const settings = await import("@/lib/events/notification-settings");
const { recordConfirmation } = await import(
  "@/lib/account/confirmation-server"
);
const { HttpError } = await import("@/lib/http-error");
const { MAX_CHAT_TARGETS } = await import("@/lib/events/types");
const { WEBHOOK_URL_PROBLEMS } = await import("@/lib/events/url-safety");

const ADA = "user_ada";
const TEAM = "org_team";
const NOW = new Date("2026-11-20T12:00:00Z");
const SLACK = "https://hooks.slack.com/services/T000/B000/XXXXXXXXXX";
const SLACK_2 = "https://hooks.slack.com/services/T000/B000/YYYYYYYYYY";
const DISCORD = "https://discord.com/api/webhooks/123456789/abcdefghij";

// The catalogs the action reads, to word the expected answers.
const english = createTranslator({
  locale: "en",
  messages: en,
  namespace: "settingsActions.notifications",
});
const spanish = createTranslator({
  locale: "es",
  messages: mergeMessages(en, es),
  namespace: "settingsActions.notifications",
});
const spanishWorkspace = createTranslator({
  locale: "es",
  messages: mergeMessages(en, es),
  namespace: "workspaceActions",
});
type Text = typeof english;

/** The Spanish for `message`, checked to be a translation of the English. */
function inSpanish(message: (t: Text) => string): string {
  const text = message(spanish);
  expect(text).toBeTruthy();
  expect(text).not.toBe(message(english));
  return text;
}

/**
 * Ada (a member of the team, with one Slack webhook there), signed in on
 * `plan`, with the language saved in Settings.
 */
function signIn(
  plan: Plan,
  { locale = null }: { locale?: string | null } = {},
) {
  state.userId = ADA;
  state.plan = plan;
  const row = fakeDb.find("user", { id: ADA });
  if (row) row.locale = locale;
}

/** "Confirm it's you", done just now (adding a webhook asks). */
const confirmed = () =>
  recordConfirmation({ userId: ADA, sessionId: "session_1" });

const addSlack = (url = SLACK_2, events = ["form.submitted"]) =>
  notifications.addNotificationWebhook({
    organizationId: TEAM,
    channel: "slack",
    url,
    events,
  });

const turnOnEmail = (organizationId: string | null = null) =>
  notifications.setNotificationEmailEvents({
    organizationId,
    events: ["form.submitted"],
  });

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.seed("user", [
    {
      id: ADA,
      name: "Ada",
      email: "ada@qrdx.test",
      locale: null,
      createdAt: NOW,
    },
  ]);
  fakeDb.seed("organization", [
    { id: TEAM, name: "Team", slug: "team", createdAt: NOW },
  ]);
  fakeDb.seed("member", [
    { id: "m_ada", organizationId: TEAM, userId: ADA, role: "owner" },
  ]);
  fakeDb.seed("notificationSetting", [
    {
      id: "n_slack",
      userId: ADA,
      organizationId: TEAM,
      channel: "slack",
      target: SLACK,
      events: ["scan.milestone"],
      createdAt: NOW,
    },
  ]);
  state.userId = null;
  state.cookieLocale = undefined;
  state.intlBroken = false;
  state.reword = null;
  state.plan = "free";
  state.shutOut = false;
  state.delivery = { ok: true };
  state.errors = [];
});

describe("Settings > Notifications, with the language menu on Spanish", () => {
  beforeEach(() => {
    state.cookieLocale = "es";
  });

  it("asks for Pro to turn on email alerts in Spanish, and offers Pro", async () => {
    signIn("free");
    expect(await turnOnEmail()).toEqual({
      ok: false,
      error: inSpanish((t) => t("emailAlertsPro")),
      upgrade: "pro",
    });
    expect(state.errors).toEqual([]);
  });

  it("asks for Business for Slack and Discord in Spanish, and offers Business", async () => {
    signIn("pro");
    await confirmed();
    const refused = {
      ok: false,
      error: inSpanish((t) => t("chatBusiness")),
      upgrade: "business",
    };
    expect(await addSlack()).toEqual(refused);
    expect(
      await notifications.updateNotificationWebhook({
        id: "n_slack",
        events: ["form.submitted"],
      }),
    ).toEqual(refused);
    expect(
      await notifications.testNotificationWebhook({ id: "n_slack" }),
    ).toEqual(refused);
    // Pro has email alerts: no refusal there.
    expect(await turnOnEmail()).toEqual({ ok: true, data: null });
    expect(state.errors).toEqual([]);
  });

  it("refuses a webhook URL in Spanish, whatever is wrong with it", async () => {
    signIn("business");
    await confirmed();
    expect(await addSlack(DISCORD)).toEqual({
      ok: false,
      error: inSpanish((t) => t("url.notSlack")),
    });
    expect(
      await notifications.addNotificationWebhook({
        organizationId: TEAM,
        channel: "discord",
        url: SLACK_2,
        events: ["form.submitted"],
      }),
    ).toEqual({ ok: false, error: inSpanish((t) => t("url.notDiscord")) });
    expect(await addSlack("http://hooks.slack.com/services/T/B/X")).toEqual({
      ok: false,
      error: inSpanish((t) => t("url.notHttps")),
    });
    expect(await addSlack("https://hooks")).toEqual({
      ok: false,
      error: inSpanish((t) => t("url.notPublic")),
    });
    expect(await addSlack(`${SLACK}${"X".repeat(2048)}`)).toEqual({
      ok: false,
      error: inSpanish((t) => t("url.tooLong")),
    });
    expect(await addSlack("  ")).toEqual({
      ok: false,
      error: inSpanish((t) => t("webhookUrlMissing")),
    });
    expect(fakeDb.rows("notificationSetting")).toHaveLength(1);
  });

  it("says a webhook is there already, or one too many, in Spanish", async () => {
    signIn("business");
    await confirmed();
    expect(await addSlack(SLACK)).toEqual({
      ok: false,
      error: inSpanish((t) => t("webhookAlreadyAdded")),
    });
    fakeDb.seed(
      "notificationSetting",
      Array.from({ length: MAX_CHAT_TARGETS - 1 }, (_, i) => ({
        id: `n_more_${i}`,
        userId: ADA,
        organizationId: TEAM,
        channel: "discord",
        target: `https://discord.com/api/webhooks/${i + 1}/token`,
        events: ["form.submitted"],
        createdAt: NOW,
      })),
    );
    const tooMany = inSpanish((t) =>
      t("tooManyWebhooks", { max: MAX_CHAT_TARGETS }),
    );
    expect(await addSlack()).toEqual({ ok: false, error: tooMany });
    expect(tooMany).toContain(String(MAX_CHAT_TARGETS));
  });

  it("asks for an event in Spanish", async () => {
    signIn("business");
    await confirmed();
    const pickEvent = inSpanish((t) => t("pickEvent"));
    expect(await addSlack(SLACK_2, [])).toEqual({
      ok: false,
      error: pickEvent,
    });
    // Events Slack doesn't get (the weekly digest is email only).
    expect(
      await notifications.updateNotificationWebhook({
        id: "n_slack",
        events: ["digest.weekly"],
      }),
    ).toEqual({ ok: false, error: pickEvent });
  });

  it("says a webhook is gone, or didn't get the test, in Spanish", async () => {
    signIn("business");
    expect(
      await notifications.updateNotificationWebhook({
        id: "n_gone",
        events: ["form.submitted"],
      }),
    ).toEqual({ ok: false, error: inSpanish((t) => t("targetNotFound")) });
    expect(
      await notifications.removeNotificationWebhook({ id: "n_gone" }),
    ).toEqual({ ok: false, error: inSpanish((t) => t("targetNotFound")) });
    state.delivery = { ok: false, error: "HTTP 404: no_service" };
    const notDelivered = inSpanish((t) =>
      t("notDelivered", { error: "HTTP 404: no_service" }),
    );
    expect(
      await notifications.testNotificationWebhook({ id: "n_slack" }),
    ).toEqual({ ok: false, error: notDelivered });
    // The delivery's own detail, as it came.
    expect(notDelivered).toContain("HTTP 404: no_service");
  });

  it("says the workspace isn't theirs, or shuts them out, in Spanish", async () => {
    signIn("business");
    expect(await turnOnEmail("org_elsewhere")).toEqual({
      ok: false,
      error: inSpanish((t) => t("notMember")),
    });
    state.shutOut = true;
    const shutOut = spanishWorkspace("shared.twoFactorRequired");
    expect(shutOut).not.toBe(en.workspaceActions.shared.twoFactorRequired);
    expect(await turnOnEmail(TEAM)).toEqual({ ok: false, error: shutOut });
    expect(state.errors).toEqual([]);
  });
});

describe("the upgrade it offers", () => {
  it("is the plan the refusal needs, whatever its words say", async () => {
    state.cookieLocale = "es";
    // Pro's refusal naming Business, and Business's naming neither.
    state.reword = (messages) => ({
      ...messages,
      emailAlertsPro: "Business también tiene alertas por correo.",
      chatBusiness: "Slack y Discord vienen con el plan superior.",
    });
    signIn("free");
    expect(await turnOnEmail()).toEqual({
      ok: false,
      error: "Business también tiene alertas por correo.",
      upgrade: "pro",
    });
    signIn("pro");
    expect(
      await notifications.testNotificationWebhook({ id: "n_slack" }),
    ).toEqual({
      ok: false,
      error: "Slack y Discord vienen con el plan superior.",
      upgrade: "business",
    });
  });

  it("isn't offered for refusals a plan doesn't lift", async () => {
    signIn("business");
    await confirmed();
    expect(await addSlack(SLACK)).not.toHaveProperty("upgrade");
    expect(await turnOnEmail("org_elsewhere")).not.toHaveProperty("upgrade");
  });
});

describe("whose language it is", () => {
  it("is the account's saved one over the language menu's", async () => {
    signIn("free", { locale: "es" });
    state.cookieLocale = "fr";
    expect(await turnOnEmail()).toEqual({
      ok: false,
      error: es.settingsActions.notifications.emailAlertsPro,
      upgrade: "pro",
    });
  });

  it("is English, word for word as before, with neither", async () => {
    signIn("free");
    expect(await turnOnEmail()).toEqual({
      ok: false,
      error: "Email alerts and the weekly digest are part of Pro.",
      upgrade: "pro",
    });
    signIn("pro");
    expect(
      await notifications.testNotificationWebhook({ id: "n_slack" }),
    ).toEqual({
      ok: false,
      error: "Slack and Discord alerts are part of the Business plan.",
      upgrade: "business",
    });
    signIn("business");
    await confirmed();
    expect(await addSlack(DISCORD)).toEqual({
      ok: false,
      error:
        "Paste a Slack incoming webhook URL (https://hooks.slack.com/services/…).",
    });
    expect(await addSlack(SLACK)).toEqual({
      ok: false,
      error: "That webhook is already added.",
    });
    expect(await addSlack(SLACK_2, [])).toEqual({
      ok: false,
      error: "Pick at least one event",
    });
    expect(await turnOnEmail("org_elsewhere")).toEqual({
      ok: false,
      error: "You're not a member of that workspace.",
    });
    expect(state.errors).toEqual([]);
  });

  it("is English, logged, when the catalog can't be read", async () => {
    signIn("free");
    state.cookieLocale = "es";
    state.intlBroken = true;
    expect(await turnOnEmail()).toEqual({
      ok: false,
      error: "Email alerts and the weekly digest are part of Pro.",
      upgrade: "pro",
    });
    expect(state.errors).toEqual(["settingsActions.text: no catalog"]);
  });
});

describe("what the settings throw, for logs and the Slack install", () => {
  // The same status, code and English as before they were translated:
  // prepareDataConnect (lib/data-connections/server.ts) reads the code.
  const refusal = (status: number, code: string, message: string) => ({
    status,
    code,
    message,
  });

  it("keeps each refusal's status, code and English", async () => {
    const thrown = async (run: () => Promise<unknown>) => {
      try {
        await run();
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        return error;
      }
      throw new Error("expected a refusal");
    };
    state.plan = "free";
    expect(
      await thrown(() =>
        settings.setEmailEvents(ADA, null, ["form.submitted"]),
      ),
    ).toMatchObject(
      refusal(
        402,
        "PLAN_REQUIRED",
        "Email alerts and the weekly digest are part of Pro.",
      ),
    );
    expect(
      await thrown(() =>
        settings.setEmailEvents(ADA, "org_elsewhere", ["form.submitted"]),
      ),
    ).toMatchObject(
      refusal(403, "FORBIDDEN", "You're not a member of that workspace."),
    );
    state.plan = "pro";
    const business = refusal(
      402,
      "PLAN_REQUIRED",
      "Slack and Discord alerts are part of the Business plan.",
    );
    const slack = {
      channel: "slack" as const,
      events: ["form.submitted" as const],
    };
    expect(
      await thrown(() =>
        settings.addChatTarget(ADA, TEAM, { ...slack, url: SLACK_2 }),
      ),
    ).toMatchObject(business);
    expect(
      await thrown(() =>
        settings.updateChatTarget(ADA, "n_slack", ["form.submitted"]),
      ),
    ).toMatchObject(business);
    expect(
      await thrown(() => settings.sendTestChatMessage(ADA, "n_slack")),
    ).toMatchObject(business);
    state.plan = "business";
    expect(
      await thrown(() =>
        settings.addChatTarget(ADA, TEAM, { ...slack, url: DISCORD }),
      ),
    ).toMatchObject(
      refusal(
        400,
        "VALIDATION_ERROR",
        "Paste a Slack incoming webhook URL (https://hooks.slack.com/services/…).",
      ),
    );
    expect(
      await thrown(() =>
        settings.addChatTarget(ADA, TEAM, { ...slack, url: SLACK }),
      ),
    ).toMatchObject(
      refusal(409, "ALREADY_EXISTS", "That webhook is already added."),
    );
    expect(
      await thrown(() => settings.removeChatTarget(ADA, "n_gone")),
    ).toMatchObject(
      refusal(404, "NOT_FOUND", "Notification target not found."),
    );
    state.delivery = { ok: false, error: "HTTP 404: no_service" };
    expect(
      await thrown(() => settings.sendTestChatMessage(ADA, "n_slack")),
    ).toMatchObject(
      refusal(502, "DELIVERY_FAILED", "Not delivered: HTTP 404: no_service"),
    );
    fakeDb.seed(
      "notificationSetting",
      Array.from({ length: MAX_CHAT_TARGETS - 1 }, (_, i) => ({
        id: `n_more_${i}`,
        userId: ADA,
        organizationId: TEAM,
        channel: "discord",
        target: `https://discord.com/api/webhooks/${i + 1}/token`,
        events: ["form.submitted"],
        createdAt: NOW,
      })),
    );
    expect(
      await thrown(() =>
        settings.addChatTarget(ADA, TEAM, { ...slack, url: SLACK_2 }),
      ),
    ).toMatchObject(
      refusal(
        403,
        "LIMIT_REACHED",
        "Add up to 10 Slack or Discord webhooks per workspace.",
      ),
    );
  });

  it("keeps the events schema's English", () => {
    const parsed = settings.chatEventsSchema.safeParse([]);
    expect(parsed.success ? null : parsed.error.issues[0]?.message).toBe(
      "Pick at least one event",
    );
  });
});

describe("the catalog's copies of the English constants", () => {
  it("match NOTIFICATION_SETTINGS_MESSAGES, every one", () => {
    const catalog = settings.notificationSettingsMessages(
      createTranslator({
        locale: "en",
        messages: en,
        namespace: "settingsActions.notifications",
      }),
    );
    const constants = settings.NOTIFICATION_SETTINGS_MESSAGES;
    const words = (messages: typeof catalog) => ({
      ...messages,
      tooManyWebhooks: messages.tooManyWebhooks(MAX_CHAT_TARGETS),
      notDelivered: messages.notDelivered("HTTP 500"),
    });
    expect(words(catalog)).toEqual(words(constants));
  });

  it("match the webhook URL checks' (WEBHOOK_URL_PROBLEMS), every one", () => {
    expect(en.settingsActions.notifications.url).toEqual(WEBHOOK_URL_PROBLEMS);
  });
});
