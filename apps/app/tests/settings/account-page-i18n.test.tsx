// Settings → Profile & security in another language, where it still said
// English: the date after "Member since", each sign-in method's row
// ("Linked Nov 5, 2026.", "Email code" and its line, "Not linked. …"), each
// passkey's "Added …" and the name a new passkey is offered and saved
// with. The page's language is the signed-in app's (lib/i18n/app-locale.ts,
// run for real): the saved one, else the language menu's cookie, else
// English. The server components are called as functions and the props
// they hand the client components are read; the sign-in methods list is
// rendered. The stolen-session check keeps reading the English device
// label (lib/account/session-origin.ts browserFamily).
import type { Locale } from "@repo/i18n/config";
import { mergeMessages } from "@repo/i18n/messages";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import ja from "@/messages/ja.json";
import { fakeDb } from "../support/fake-db";

const USER = "user_1";
const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const JOINED = new Date("2026-03-04T12:00:00Z");
const LINKED = new Date("2026-11-05T12:00:00Z");

const state = vi.hoisted(() => ({
  cookieLocale: undefined as string | undefined,
  userAgent: "",
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
    headers: async () =>
      new Headers({ host: "localhost:3000", "user-agent": state.userAgent }),
    cookies: async () => ({
      get: (name: string) =>
        name === localeCookie && state.cookieLocale
          ? { name, value: state.cookieLocale }
          : undefined,
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
    }) =>
      translator({
        locale,
        messages: await loadMessages(locale),
        namespace: namespace as never,
      }),
  };
});
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  usePathname: () => "/settings/account",
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    refresh: () => undefined,
    prefetch: () => undefined,
    back: () => undefined,
    forward: () => undefined,
  }),
}));
vi.mock("@repo/auth/client", () => ({ authClient: {} }));
vi.mock("@/components/confirm-identity/provider", () => ({
  ConfirmIdentityProvider: ({ children }: { children: ReactNode }) => children,
  useConfirmation: () => ({
    withConfirmation: async (run: () => unknown) => await run(),
  }),
}));
vi.mock("@repo/auth/passkey", () => ({
  cookiesToSet: () => [],
  getAuthenticatorName: () => undefined,
}));
vi.mock("@/lib/account/two-factor-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/account/two-factor-server")>()),
  passkeysWorkHere: () => true,
  loadTwoFactorMethods: async () => ({
    on: true,
    passkeys: 2,
    authenticatorApp: false,
    backupCodesLeft: 10,
  }),
}));
vi.mock("@/lib/account/two-factor-reset-server", () => ({
  loadPendingTwoFactorReset: async () => null,
  formatTwoFactorResetDate: (date: Date) => date.toISOString(),
}));
vi.mock("@/lib/account/deletion-server", () => ({
  loadDeletionFacts: async () => ({
    teams: [],
    subscription: null,
    billingConfigured: true,
    personal: { codes: 0, pages: 0, files: 0, domains: 0 },
  }),
}));
vi.mock("@/lib/community/profiles", () => ({
  getMyCommunityProfile: async () => null,
}));
vi.mock("@/lib/auth/sign-in-options-server", () => ({
  getSignInOptions: () => ({ email: true }),
}));
vi.mock("@/lib/account/linked-sign-ins-server", () => ({
  configuredSocialProviders: () => ["google", "github"],
}));
vi.mock("@/lib/storage/r2", () => ({ isStorageConfigured: false }));
vi.mock("@/lib/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shared")>()),
  logError: (error: Error) => state.errors.push(error.message),
}));
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: {
          id: "user_1",
          email: "ada@qrdx.test",
          name: "Ada",
          emailVerified: true,
          image: null,
          createdAt: new Date("2026-03-04T12:00:00Z"),
        },
        session: { id: "session_1", createdAt: new Date() },
      }),
      listUserAccounts: async () => [
        {
          id: "acc_github",
          providerId: "github",
          createdAt: new Date("2026-11-05T12:00:00Z"),
        },
      ],
    },
  },
}));

const { default: AccountPage } = await import(
  "@/app/(app)/settings/account/page"
);
const { ProfileSection } = await import(
  "@/app/(app)/settings/account/_components/profile-section"
);
const { SignInMethodsSection } = await import(
  "@/app/(app)/settings/account/_components/sign-in-methods-section"
);
const { TwoFactorSection } = await import(
  "@/app/(app)/settings/account/_components/two-factor-section"
);
const { TwoFactorSettings } = await import(
  "@/app/(app)/settings/account/_components/two-factor-settings"
);
const { newPasskeyName } = await import("@/lib/account/passkey-name-server");
const { browserFamily } = await import("@/lib/account/session-origin");

const spanish = mergeMessages(en, es);
const t = createTranslator({ locale: "es", messages: spanish });
const spanishDate = (date: Date) =>
  new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);

/** The props of the first element of `type` in a rendered server tree. */
function propsOf<P>(node: ReactNode, type: unknown): P | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = propsOf<P>(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (element.type === type) return element.props as P;
  return propsOf<P>(element.props.children, type);
}

async function accountPage() {
  return await AccountPage({ searchParams: Promise.resolve({}) });
}

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.seed("user", [{ id: USER, email: "ada@qrdx.test", locale: null }]);
  fakeDb.seed("passkey", [
    {
      id: "pk_named",
      userId: USER,
      name: "Work laptop",
      createdAt: LINKED,
      deviceType: "multiDevice",
      backedUp: true,
      aaguid: null,
      credentialID: "c1",
    },
    {
      id: "pk_unnamed",
      userId: USER,
      name: null,
      createdAt: JOINED,
      deviceType: "singleDevice",
      backedUp: false,
      aaguid: null,
      credentialID: "c2",
    },
  ]);
  state.cookieLocale = undefined;
  state.userAgent = CHROME_MAC;
  state.errors = [];
});

describe("Profile & security, with the language menu on Spanish", () => {
  beforeEach(() => {
    state.cookieLocale = "es";
  });

  it("dates Member since and each linked sign-in method in Spanish", async () => {
    const page = await accountPage();
    const profile = propsOf<{ profile: { memberSince: string } }>(
      page,
      ProfileSection,
    );
    expect(profile?.profile.memberSince).toBe(spanishDate(JOINED));
    expect(profile?.profile.memberSince).not.toBe("Mar 4, 2026");
    const methods = propsOf<{
      methods: { kind: string; linkedAt: string | null }[];
    }>(page, SignInMethodsSection);
    expect(methods?.methods[0]).toMatchObject({
      kind: "github",
      linkedAt: spanishDate(LINKED),
    });
  });

  it("writes the sign-in methods' rows in Spanish", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="es" messages={spanish} timeZone="UTC">
        <SignInMethodsSection
          email="ada@qrdx.test"
          linkable={["google"]}
          methods={[
            {
              id: "acc_github",
              kind: "github",
              label: "GitHub",
              linkedAt: spanishDate(LINKED),
              unlinkBlocked: null,
            },
            {
              id: "email",
              kind: "email",
              label: "Email code",
              linkedAt: null,
              unlinkBlocked: "Email codes always work for your address.",
            },
          ]}
          outcome={null}
        />
      </NextIntlClientProvider>,
    );
    const section = "app.settings.account.signInMethodsSection";
    for (const line of [
      t(`${section}.linkedOn` as never, { date: spanishDate(LINKED) } as never),
      t(`${section}.emailCode` as never),
      t(
        `${section}.oneTimeCodeSentTo` as never,
        { email: "ada@qrdx.test" } as never,
      ),
      t(
        `${section}.notLinkedUseThe` as never,
        { provider: "Google", email: "ada@qrdx.test" } as never,
      ),
    ]) {
      expect(html).toContain(line.replaceAll("'", "&#x27;"));
    }
    expect(html).not.toContain("Linked ");
    expect(html).not.toContain("Email code");
    expect(html).not.toContain("Not linked");
  });

  it("says when each passkey was added, and names a new one, in Spanish", async () => {
    const section = await TwoFactorSection({
      userId: USER,
      email: "ada@qrdx.test",
    });
    const props = propsOf<{
      passkeys: { id: string; name: string; added: string }[];
      defaultPasskeyName: string;
    }>(section, TwoFactorSettings);
    const settings = "app.settings.account.twoFactorSettings";
    expect(props?.passkeys).toMatchObject([
      {
        id: "pk_named",
        name: "Work laptop",
        added: t(
          `${settings}.addedOn` as never,
          { date: spanishDate(LINKED) } as never,
        ),
      },
      { id: "pk_unnamed", name: t(`${settings}.passkeyName` as never) },
    ]);
    expect(props?.passkeys[0]?.added).not.toMatch(/^Added /);
    // The device it's made on, in the words Settings → Sessions uses.
    const deviceName = t(
      "emails.security.browserOnOs" as never,
      {
        browser: "Chrome",
        os: "macOS",
      } as never,
    );
    expect(deviceName).not.toBe("Chrome on macOS");
    expect(props?.defaultPasskeyName).toBe(deviceName);
  });

  it("names a passkey from a browser it can't tell with the page's word", async () => {
    // Spanish keeps "Passkey", as its Settings page does; Japanese doesn't.
    expect(await newPasskeyName(null)).toBe(
      es.app.settings.account.twoFactorSettings.passkeyName,
    );
    state.cookieLocale = "ja";
    expect(await newPasskeyName(null)).toBe(
      ja.app.settings.account.twoFactorSettings.passkeyName,
    );
    expect(await newPasskeyName(null)).not.toBe("Passkey");
    expect(state.errors).toEqual([]);
  });

  it("leaves the stolen-session check's English label alone", async () => {
    expect(await newPasskeyName(CHROME_MAC)).not.toBe("Chrome on macOS");
    expect(browserFamily(CHROME_MAC)).toBe("Chrome on macOS");
    expect(browserFamily(null)).toBe("Unknown device");
  });
});

describe("whose language it is", () => {
  it("is the account's saved one over the language menu's", async () => {
    fakeDb.resetAll();
    fakeDb.seed("user", [{ id: USER, email: "ada@qrdx.test", locale: "es" }]);
    state.cookieLocale = "fr";
    const page = await accountPage();
    expect(
      propsOf<{ profile: { memberSince: string } }>(page, ProfileSection)
        ?.profile.memberSince,
    ).toBe(spanishDate(JOINED));
    expect(await newPasskeyName(null)).toBe(
      es.app.settings.account.twoFactorSettings.passkeyName,
    );
  });

  it("is English, as before, with neither", async () => {
    const page = await accountPage();
    expect(
      propsOf<{ profile: { memberSince: string } }>(page, ProfileSection)
        ?.profile.memberSince,
    ).toBe("Mar 4, 2026");
    expect(
      propsOf<{ methods: { linkedAt: string | null }[] }>(
        page,
        SignInMethodsSection,
      )?.methods[0]?.linkedAt,
    ).toBe("Nov 5, 2026");
    const section = await TwoFactorSection({
      userId: USER,
      email: "ada@qrdx.test",
    });
    const props = propsOf<{
      passkeys: { name: string; added: string }[];
      defaultPasskeyName: string;
    }>(section, TwoFactorSettings);
    expect(props?.passkeys.map((passkey) => passkey.added)).toEqual([
      "Added Nov 5, 2026",
      "Added Mar 4, 2026",
    ]);
    expect(props?.passkeys[1]?.name).toBe("Passkey");
    expect(props?.defaultPasskeyName).toBe("Chrome on macOS");
    expect(await newPasskeyName(null)).toBe("Passkey");

    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <SignInMethodsSection
          email="ada@qrdx.test"
          linkable={["google"]}
          methods={[
            {
              id: "acc_github",
              kind: "github",
              label: "GitHub",
              linkedAt: "Nov 5, 2026",
              unlinkBlocked: null,
            },
            {
              id: "email",
              kind: "email",
              label: "Email code",
              linkedAt: null,
              unlinkBlocked: "Email codes always work for your address.",
            },
          ]}
          outcome={null}
        />
      </NextIntlClientProvider>,
    );
    expect(html).toContain("Linked Nov 5, 2026.");
    expect(html).toContain("Email code");
    expect(html).toContain("A one-time code sent to ada@qrdx.test.");
    expect(html).toContain(
      "Not linked. Use the Google account with ada@qrdx.test.",
    );
    expect(state.errors).toEqual([]);
  });
});
