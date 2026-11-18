// What Settings' server actions answer, in the person's language: profile,
// sign-in methods and sessions, deleting the account, the email change,
// two-step verification and passkeys, the affiliate program, integrations,
// API keys and OAuth apps, Slack links, authorized apps and notifications.
// The pages show an action's `error` as it is, so it must be in the page's
// language: the signed-in app's (lib/i18n/app-locale.ts, run for real
// here), the saved one, else the language menu's cookie, else English. Only
// next-intl's server entry, which needs Next's plugin, is swapped for what
// i18n/request.ts does: the locale's catalog over English. The same calls
// without a language answer the English they always did, and the catalog's
// copies of the English constants match them.
import type { Locale } from "@repo/i18n/config";
import { mergeMessages } from "@repo/i18n/messages";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import { fakeDb } from "../support/fake-db";

const USER = "user_1";
const SESSION = "session_1";

const state = vi.hoisted(() => ({
  signedIn: false,
  /** The language menu's cookie (NEXT_LOCALE), if any */
  cookieLocale: undefined as string | undefined,
  errors: [] as string[],
  /** The catalog can't be read */
  catalogBroken: false,
  /** What executeAccountDeletion throws, if anything */
  deletionError: null as Error | null,
  deletionFacts: null as unknown,
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
    headers: async () =>
      new Headers({ host: "localhost:3000", "user-agent": "test" }),
    cookies: async () => ({
      get: (name: string) =>
        name === localeCookie && state.cookieLocale
          ? { name, value: state.cookieLocale }
          : undefined,
      set: () => undefined,
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
      if (state.catalogBroken) throw new Error("catalog unreadable");
      return translator({
        locale,
        messages: await loadMessages(locale),
        namespace: namespace as never,
      });
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/server", () => ({
  after: (run: () => unknown) => {
    void run();
  },
}));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
vi.mock("@repo/auth/passkey", () => ({ cookiesToSet: () => [] }));
vi.mock("@repo/auth/passkey-rp", () => ({
  passkeyRelyingParty: () => ({ rpID: "localhost", origin: "x" }),
  isPasskeyOrigin: () => true,
}));
vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: () => true,
}));
vi.mock("@/lib/slack-bot/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/slack-bot/config")>()),
  isSlackBotEnabled: () => false,
}));
vi.mock("@/lib/account/reauth", () => ({ signInCodesAvailable: () => true }));
vi.mock("@/lib/account/linked-sign-ins-server", () => ({
  linkedSignInsFor: async () => [],
  configuredSocialProviders: () => ["google", "github"],
}));
vi.mock("@/lib/delivery-guard", () => ({
  isOutboundDeliveryAllowed: () => false,
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: async () => ({ sent: true }),
}));
vi.mock("@/lib/storage/r2", () => ({
  isStorageConfigured: false,
  putObject: async () => undefined,
  deleteObject: async () => undefined,
  publicUrl: () => null,
}));
vi.mock("@/lib/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shared")>()),
  logError: (error: Error) => state.errors.push(error.message),
}));
vi.mock("@/lib/scope", async () => {
  const { UnauthorizedError } = await import("@/types/errors");
  return {
    getActiveScope: async () => {
      if (!state.signedIn) throw new UnauthorizedError();
      return { userId: USER, organizationId: "org_1", role: "owner" };
    },
  };
});
vi.mock("@/lib/account/deletion-server", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/lib/account/deletion-server")>();
  return {
    AccountDeletionError: real.AccountDeletionError,
    loadDeletionFacts: async () => state.deletionFacts,
    executeAccountDeletion: async () => {
      if (state.deletionError) throw state.deletionError;
    },
  };
});
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () =>
        state.signedIn
          ? {
              user: { id: "user_1", email: "ada@qrdx.test", name: "Ada" },
              session: {
                id: "session_1",
                createdAt: new Date(Date.now() - 3 * 86_400_000),
              },
            }
          : null,
    },
  },
}));

const account = await import("@/app/(app)/settings/account/_lib/actions");
const { deleteAccount } = await import("@/actions/account");
const emailChange = await import(
  "@/app/(app)/settings/account/_lib/email-change-actions"
);
const twoFactor = await import(
  "@/app/(app)/settings/account/_lib/two-factor-actions"
);
const passkeys = await import(
  "@/app/(app)/settings/account/_lib/passkey-actions"
);
const { cancelSupportTwoFactorReset } = await import(
  "@/app/(app)/settings/account/_lib/two-factor-reset-actions"
);
const affiliate = await import("@/app/(app)/settings/affiliate/_lib/actions");
const { connectDataSourceAction } = await import(
  "@/app/(app)/settings/integrations/data-connection-actions"
);
const { connectWithApiKeyAction, setDefaultShortLinkDomainAction } =
  await import("@/app/(app)/settings/integrations/connected-account-actions");
const { unlinkSlackIdentityAction } = await import(
  "@/app/(app)/settings/integrations/slack-bot-actions"
);
const { deleteOAuthAppAction } = await import(
  "@/app/(app)/settings/developers/_lib/actions"
);
const { createApiKeyAction } = await import(
  "@/app/(app)/settings/developers/_lib/api-key-actions"
);
const { revokeSlackLinkAction } = await import(
  "@/app/(app)/settings/developers/_lib/slack-link-actions"
);
const { revokeAuthorizedAppAction } = await import(
  "@/app/(app)/settings/authorized-apps/_lib/actions"
);
const { removeNotificationWebhook } = await import(
  "@/app/(app)/settings/notifications/_lib/actions"
);
const { recordConfirmation } = await import(
  "@/lib/account/confirmation-server"
);
const { AccountDeletionError } = await import("@/lib/account/deletion-server");
const { UNLINK_BLOCK_MESSAGES, unlinkBlockMessages } = await import(
  "@/lib/account/sign-in-methods"
);
const { EMAIL_CHANGE_MESSAGES, emailChangeMessages } = await import(
  "@/lib/account/email-change"
);
const { TWO_FACTOR_MANAGE_MESSAGES, twoFactorManageMessages } = await import(
  "@/lib/account/two-factor-manage"
);
const { CHOSEN_CODE_MESSAGES, chosenCodeMessages } = await import(
  "@/lib/affiliates/rules"
);
const { ssoEmailChangeMessage } = await import("@/ee/sso/messages");

const spanish = mergeMessages(en, es);
const inSpanish = createTranslator({ locale: "es", messages: spanish });
const inEnglish = createTranslator({ locale: "en", messages: en });

/** The Spanish for a catalog key, checked to be a translation. */
function spanishFor(key: string, values?: Record<string, string>): string {
  const english = inEnglish(key as never, values as never);
  const text = inSpanish(key as never, values as never);
  expect(text).toBeTruthy();
  expect(text).not.toBe(english);
  return text;
}

const refused = (error: string) => ({ ok: false, error });

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.seed("user", [
    { id: USER, email: "ada@qrdx.test", name: "Ada", locale: null },
  ]);
  state.signedIn = false;
  state.cookieLocale = undefined;
  state.errors = [];
  state.catalogBroken = false;
  state.deletionError = null;
  state.deletionFacts = null;
});

const STRIPE_SECRET = `sk_live_${"a".repeat(24)}`;

describe("Settings' actions, with the language menu on Spanish", () => {
  beforeEach(() => {
    state.cookieLocale = "es";
  });

  it("profile: a missing or long name, signed out", async () => {
    expect(await account.updateProfileName({ name: "   " })).toEqual(
      refused(spanishFor("settingsActions.account.nameMissing")),
    );
    const tooLong = spanishFor("settingsActions.account.nameTooLong", {
      max: "64",
    });
    expect(tooLong).toContain("64");
    expect(await account.updateProfileName({ name: "x".repeat(65) })).toEqual(
      refused(tooLong),
    );
    expect(await account.updateProfileName({ name: "Ada" })).toEqual(
      refused(spanishFor("settingsActions.account.profileSignedOut")),
    );
    expect(await account.removeAvatar()).toEqual(
      refused(spanishFor("settingsActions.account.profileSignedOut")),
    );
  });

  it("sign-in methods and sessions, signed out (the signed-out line read only then)", async () => {
    expect(await account.linkSignInMethod({ provider: "github" })).toEqual(
      refused(spanishFor("settingsActions.account.methodsSignedOut")),
    );
    expect(await account.revokeOtherSessions()).toEqual(
      refused(spanishFor("settingsActions.account.sessionsSignedOut")),
    );
  });

  it("this device can't be signed out from Sessions", async () => {
    state.signedIn = true;
    expect(await account.revokeSession({ sessionId: SESSION })).toEqual(
      refused(spanishFor("settingsActions.account.thisDevice")),
    );
  });

  it("deleting the account: the word to type stays delete", async () => {
    const typeIt = spanishFor("settingsActions.deleteAccount.typeToConfirm", {
      word: "delete",
    });
    expect(typeIt).toContain('"delete"');
    expect(await deleteAccount({ confirmation: "borrar" })).toEqual(
      refused(typeIt),
    );
    expect(await deleteAccount({ confirmation: "delete" })).toEqual(
      refused(spanishFor("settingsActions.deleteAccount.signedOut")),
    );
  });

  it("deleting the account: a subscription to cancel first, or an owner that couldn't be made", async () => {
    state.signedIn = true;
    await recordConfirmation({ userId: USER, sessionId: SESSION });
    state.deletionFacts = {
      teams: [],
      subscription: {
        status: "active",
        planName: "Pro",
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
      },
      billingConfigured: false,
      personal: { codes: 0, pages: 0, files: 0, domains: 0 },
    };
    expect(await deleteAccount({ confirmation: "delete" })).toEqual(
      refused(
        spanishFor("app.settings.account.deletion.subscriptionBlocker", {
          plan: "Pro",
        }),
      ),
    );

    state.deletionFacts = {
      teams: [],
      subscription: null,
      billingConfigured: true,
      personal: { codes: 0, pages: 0, files: 0, domains: 0 },
    };
    state.deletionError = new AccountDeletionError("English for admin", {
      kind: "owner",
      person: "Grace",
      team: "Acme",
    });
    expect(await deleteAccount({ confirmation: "delete" })).toEqual(
      refused(
        spanishFor("settingsActions.deleteAccount.ownerNotMade", {
          person: "Grace",
          team: "Acme",
        }),
      ),
    );
    state.deletionError = new AccountDeletionError("English for admin", {
      kind: "subscription",
    });
    const notCancelled = spanishFor(
      "settingsActions.deleteAccount.subscriptionNotCancelled",
      { email: "support@qrdx.dev" },
    );
    expect(notCancelled).toContain("support@qrdx.dev");
    expect(await deleteAccount({ confirmation: "delete" })).toEqual(
      refused(notCancelled),
    );
  });

  it("the email change: an address that isn't one, a code that isn't one, signed out", async () => {
    expect(
      await emailChange.requestEmailChange({ newEmail: "not-an-address" }),
    ).toEqual(refused(spanishFor("settingsActions.emailChange.invalidEmail")));
    expect(
      await emailChange.confirmEmailChange({
        newEmail: "new@qrdx.test",
        code: "12",
      }),
    ).toEqual(refused(spanishFor("settingsActions.emailChange.invalidCode")));
    expect(
      await emailChange.requestEmailChange({ newEmail: "new@qrdx.test" }),
    ).toEqual(refused(spanishFor("settingsActions.emailChange.signedOut")));
  });

  it("two-step verification, passkeys and support's reset, signed out or misnamed", async () => {
    expect(await twoFactor.regenerateBackupCodes()).toEqual(
      refused(spanishFor("settingsActions.twoFactor.signedOut")),
    );
    expect(await passkeys.passkeyRegistrationOptions()).toEqual(
      refused(spanishFor("auth.passkeyMessages.signedOut")),
    );
    expect(await passkeys.renamePasskey({ id: "pk_1", name: "   " })).toEqual(
      refused(spanishFor("auth.passkeyMessages.invalidName")),
    );
    expect(await cancelSupportTwoFactorReset()).toEqual(
      refused(spanishFor("auth.confirmationMessages.signedOut")),
    );
  });

  it("the affiliate program: a code that can't be one, a PayPal address that isn't one, signed out", async () => {
    expect(
      await affiliate.chooseReferralCodeAction({ code: "x".repeat(70) }),
    ).toEqual(
      refused(spanishFor("settingsActions.affiliate.chosenCode.format")),
    );
    expect(await affiliate.chooseReferralCodeAction({ code: "ana" })).toEqual(
      refused(spanishFor("settingsActions.affiliate.signedOut")),
    );
    expect(await affiliate.savePaypalEmailAction({ email: "nope" })).toEqual(
      refused(spanishFor("settingsActions.affiliate.paypalEmailInvalid")),
    );
  });

  it("integrations: a Stripe secret key, a short token, signed out", async () => {
    expect(
      await connectDataSourceAction({ provider: "stripe", apiKey: "short" }),
    ).toEqual(refused(spanishFor("settingsActions.dataConnections.signedOut")));
    state.signedIn = true;
    expect(
      await connectDataSourceAction({
        provider: "stripe",
        apiKey: STRIPE_SECRET,
      }),
    ).toEqual(
      refused(spanishFor("settingsActions.dataConnections.stripeSecretKey")),
    );
    expect(
      await connectDataSourceAction({ provider: "stripe", apiKey: "short" }),
    ).toEqual(refused(spanishFor("settingsActions.dataConnections.tooShort")));
    expect(await connectWithApiKeyAction("bitly", "short")).toEqual(
      refused(spanishFor("settingsActions.connectedAccounts.keyTooShort")),
    );
    state.signedIn = false;
    expect(await setDefaultShortLinkDomainAction("short-io", "d_1")).toEqual(
      refused(spanishFor("settingsActions.connectedAccounts.domainSignedOut")),
    );
    expect(await unlinkSlackIdentityAction("link_1")).toEqual(
      refused(spanishFor("settingsActions.slackBot.unavailable")),
    );
  });

  it("API keys, OAuth apps, Slack links, authorized apps and notifications, signed out", async () => {
    expect(
      await createApiKeyAction({
        name: "CI",
        scopes: ["codes:read"],
        expiresInDays: null,
      }),
    ).toEqual(refused(spanishFor("settingsActions.apiKeys.signedOut")));
    expect(await deleteOAuthAppAction({ id: "app_1" })).toEqual(
      refused(spanishFor("settingsActions.oauthApps.signedOut")),
    );
    expect(await revokeSlackLinkAction({ id: "link_1" })).toEqual(
      refused(spanishFor("settingsActions.slackLinks.signedOut")),
    );
    expect(await revokeAuthorizedAppAction({ appId: "app_1" })).toEqual(
      refused(spanishFor("settingsActions.authorizedApps.signedOut")),
    );
    expect(await removeNotificationWebhook({ id: "target_1" })).toEqual(
      refused(spanishFor("settingsActions.notifications.signedOut")),
    );
  });

  it("logs nothing to say any of it", async () => {
    await account.updateProfileName({ name: "" });
    await deleteAccount({ confirmation: "nope" });
    await affiliate.chooseReferralCodeAction({ code: "x".repeat(70) });
    expect(state.errors).toEqual([]);
  });
});

describe("whose language it is", () => {
  it("is the account's saved one over the language menu's", async () => {
    fakeDb.resetAll();
    fakeDb.seed("user", [
      { id: USER, email: "ada@qrdx.test", name: "Ada", locale: "es" },
    ]);
    state.signedIn = true;
    state.cookieLocale = "fr";
    expect(
      await connectDataSourceAction({
        provider: "stripe",
        apiKey: STRIPE_SECRET,
      }),
    ).toEqual(refused(es.settingsActions.dataConnections.stripeSecretKey));
  });

  it("is English, word for word as before, with neither", async () => {
    expect(await account.updateProfileName({ name: "   " })).toEqual(
      refused("Enter your name."),
    );
    expect(await account.updateProfileName({ name: "x".repeat(65) })).toEqual(
      refused("Use 64 characters or fewer."),
    );
    expect(await account.updateProfileName({ name: "Ada\u0007" })).toEqual(
      refused("Remove special characters."),
    );
    expect(await account.updateProfileName({ name: "Ada" })).toEqual(
      refused("Sign in to change your profile."),
    );
    expect(await account.linkSignInMethod({ provider: "github" })).toEqual(
      refused("Sign in to manage sign-in methods."),
    );
    expect(await account.revokeOtherSessions()).toEqual(
      refused("Sign in to manage sessions."),
    );
    expect(await deleteAccount({ confirmation: "nope" })).toEqual(
      refused('Type "delete" to confirm.'),
    );
    expect(await deleteAccount({ confirmation: "delete" })).toEqual(
      refused("Sign in to delete your account."),
    );
    expect(
      await emailChange.requestEmailChange({ newEmail: "not-an-address" }),
    ).toEqual(refused("Enter a valid email address."));
    expect(await twoFactor.regenerateBackupCodes()).toEqual(
      refused("Sign in to change two-step verification."),
    );
    expect(await passkeys.renamePasskey({ id: "pk_1", name: " " })).toEqual(
      refused("Give the passkey a name."),
    );
    expect(await cancelSupportTwoFactorReset()).toEqual(
      refused("Sign in again to continue."),
    );
    expect(
      await affiliate.chooseReferralCodeAction({ code: "x".repeat(70) }),
    ).toEqual(
      refused(
        "Use 3 to 32 lower-case letters, digits and single hyphens, starting and ending with a letter or digit.",
      ),
    );
    expect(await affiliate.savePaypalEmailAction({ email: "nope" })).toEqual(
      refused("Enter the email address of your PayPal account."),
    );
    expect(await unlinkSlackIdentityAction("link_1")).toEqual(
      refused("The QRdx bot for Slack isn't available here."),
    );
    expect(await deleteOAuthAppAction({ id: "app_1" })).toEqual(
      refused("Sign in to manage OAuth apps."),
    );
    expect(await removeNotificationWebhook({ id: "target_1" })).toEqual(
      refused("Sign in to change notifications."),
    );
    state.signedIn = true;
    expect(
      await connectDataSourceAction({
        provider: "stripe",
        apiKey: STRIPE_SECRET,
      }),
    ).toEqual(
      refused(
        "That's a full secret key. Create a restricted key with Payment Links: Read instead; QRdx never stores secret keys.",
      ),
    );
    expect(await connectWithApiKeyAction("bitly", "short")).toEqual(
      refused("That key looks too short"),
    );
    expect(await account.revokeSession({ sessionId: SESSION })).toEqual(
      refused("That's this device. Use Sign out in the menu instead."),
    );
    expect(state.errors).toEqual([]);
  });

  it("is English when the language can't be read, logged", async () => {
    state.cookieLocale = "es";
    state.catalogBroken = true;
    expect(await account.updateProfileName({ name: "" })).toEqual(
      refused("Enter your name."),
    );
    expect(await deleteAccount({ confirmation: "delete" })).toEqual(
      refused("Sign in to delete your account."),
    );
    expect(state.errors).toEqual(["catalog unreadable", "catalog unreadable"]);
  });
});

describe("the catalog's copies of the actions' English", () => {
  const english = <NS extends string>(namespace: NS) =>
    createTranslator({
      locale: "en",
      messages: en,
      namespace: namespace as never,
    });

  it("match UNLINK_BLOCK_MESSAGES", () => {
    expect(
      unlinkBlockMessages(english("settingsActions.account.unlinkBlocked")),
    ).toEqual(UNLINK_BLOCK_MESSAGES);
  });

  it("match EMAIL_CHANGE_MESSAGES", () => {
    expect(emailChangeMessages(english("settingsActions.emailChange"))).toEqual(
      EMAIL_CHANGE_MESSAGES,
    );
  });

  it("match two-step verification's own messages", () => {
    expect(
      twoFactorManageMessages(
        english("auth.twoFactorMessages"),
        english("settingsActions.twoFactor"),
      ),
    ).toEqual(TWO_FACTOR_MANAGE_MESSAGES);
  });

  it("match CHOSEN_CODE_MESSAGES", () => {
    expect(
      chosenCodeMessages(english("settingsActions.affiliate.chosenCode")),
    ).toEqual(CHOSEN_CODE_MESSAGES);
  });

  it("match single sign-on's refusals of an email change (ee/sso/messages.ts)", () => {
    const t = english("settingsActions.emailChange");
    for (const kind of ["off", "onto"] as const) {
      const key = kind === "off" ? "ssoOff" : "ssoOnto";
      expect(t(key as never, { domain: "acme.test" } as never)).toBe(
        ssoEmailChangeMessage({ kind, domain: "acme.test" }),
      );
    }
  });

  it("match what deleting the account stops with (lib/account/deletion-server.ts)", () => {
    const t = english("settingsActions.deleteAccount");
    expect(
      t(
        "subscriptionNotCancelled" as never,
        {
          email: "support@qrdx.dev",
        } as never,
      ),
    ).toBe(
      "We couldn't cancel your subscription, so your account wasn't deleted. Please try again in a few minutes, or email support@qrdx.dev.",
    );
    expect(
      t("ownerNotMade" as never, { person: "Grace", team: "Acme" } as never),
    ).toBe(
      "We couldn't make Grace an owner of Acme, so your account wasn't deleted. Make someone else an owner of the team, then try again.",
    );
  });
});
