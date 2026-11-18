// @vitest-environment jsdom
// The sign-out screen in another language (app.signOut in the catalog,
// shipped by sign-out/layout.tsx with SIGN_IN_NAMESPACES): the question, the
// failure and the page title, here in Spanish, with only the catalog parts
// that layout sends.
import { mergeMessages, pickMessages } from "@repo/i18n/messages";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SIGN_IN_NAMESPACES } from "@/lib/i18n/playground";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

const auth = vi.hoisted(() => ({
  signOut: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@repo/auth/client", () => ({ authClient: auth }));
vi.mock("@repo/analytics", () => ({
  track: () => undefined,
  resetAnalytics: () => undefined,
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    refresh: () => undefined,
    prefetch: () => undefined,
    back: () => undefined,
    forward: () => undefined,
  }),
}));
// The person's language on app pages, here Spanish.
const spanish = mergeMessages(en, es);
vi.mock("@/lib/i18n/app-locale", () => ({
  getAppTranslations: async (namespace: string) =>
    createTranslator({
      locale: "es",
      messages: spanish,
      namespace: namespace as never,
    }),
}));

const { SignOutScreen } = await import(
  "@/app/(app)/(auth)/sign-out/sign-out-screen"
);
const { generateMetadata } = await import("@/app/(app)/(auth)/sign-out/page");

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const copy = en.app.signOut.signOutScreen;
const copyEs = es.app.signOut.signOutScreen;

/** The Spanish for an English string, checked to be a translation. */
function translated(english: string, spanishText: string): string {
  expect(spanishText).toBeTruthy();
  expect(spanishText).not.toBe(english);
  return spanishText;
}

describe("the sign-out screen in Spanish", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    auth.getSession.mockResolvedValue({ data: { user: { id: "user_1" } } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it("asks first, then says when signing out failed", async () => {
    await act(async () => {
      root.render(
        <NextIntlClientProvider
          locale="es"
          messages={pickMessages(spanish, SIGN_IN_NAMESPACES)}
          timeZone="UTC"
        >
          <SignOutScreen />
        </NextIntlClientProvider>,
      );
    });
    const text = () => host.textContent ?? "";
    expect(text()).toContain(
      translated(copy.signOutOfQrdx, copyEs.signOutOfQrdx),
    );
    expect(text()).toContain(translated(copy.cancel, copyEs.cancel));
    expect(text()).not.toContain(copy.signOutOfQrdx);

    auth.signOut.mockResolvedValue({ error: { message: "network" } });
    const signOut = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === copyEs.signOut,
    );
    expect(signOut, "the Sign out button, in Spanish").toBeDefined();
    await act(async () => {
      signOut?.click();
    });
    expect(text()).toContain(
      translated(copy.youreStillSignedIn, copyEs.youreStillSignedIn),
    );
    expect(text()).toContain(
      translated(
        copy.signingOutDidntWorkCheck,
        copyEs.signingOutDidntWorkCheck,
      ),
    );
    expect(text()).toContain(translated(copy.tryAgain, copyEs.tryAgain));
    expect(text()).toContain(
      translated(copy.backToDashboard, copyEs.backToDashboard),
    );
    expect(text()).not.toContain(copy.youreStillSignedIn);
  });

  it("titles the page in the person's language", async () => {
    expect((await generateMetadata()).title).toBe(
      translated(copy.pageTitle, copyEs.pageTitle),
    );
  });
});
