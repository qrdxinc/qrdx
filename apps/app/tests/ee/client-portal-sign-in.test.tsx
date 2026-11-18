// @vitest-environment jsdom
// The client portal's sign-in (ee/client-portal/portal-sign-in.tsx) offers
// only the email code. It follows the same answer as the main sign-in panel
// (use-sign-in-options.ts: the running server's, not the build's): where no
// code can be delivered it says email sign-in isn't set up instead of
// showing a form that can only fail. When the server can't be asked, it
// shows the form, whose send answers what the server really can do; it never
// claims "isn't set up" from the build's guess.
import { NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SignInOptions } from "@/lib/auth/sign-in-options";
import en from "@/messages/en.json";

const action = vi.hoisted(() => ({
  loadSignInOptions: vi.fn<() => Promise<SignInOptions>>(),
}));

vi.mock("@/app/(app)/(auth)/components/sign-in-options-action", () => action);
// Server actions the email form's other parts import; none runs here.
vi.mock("@/ee/sso/sign-in-offer", () => ({ ssoSignInOffer: vi.fn() }));
vi.mock("@/app/(app)/(auth)/sign-in/_lib/two-factor-actions", () => ({}));
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
  usePathname: () => "/portal/acme",
  useSearchParams: () => new URLSearchParams(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const form = en.auth.emailCodeSignIn;

const NOTHING: SignInOptions = {
  google: false,
  github: false,
  email: false,
  sso: false,
};

// A Docker image built without secrets: the root layout says nothing works.
const BUILD_VIEW = {
  unavailable: ["googleSignIn", "githubSignIn", "emailSignIn", "sso"],
  hiddenPaths: [],
  hiddenIntegrations: [],
} as never;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.resetModules();
  action.loadSignInOptions.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function renderPortalSignIn() {
  // Fresh modules: the server's answer is kept for the page load.
  const { PortalSignIn } = await import("@/ee/client-portal/portal-sign-in");
  const { AvailabilityProvider } = await import(
    "@/components/availability-provider"
  );
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <AvailabilityProvider value={BUILD_VIEW}>
          <PortalSignIn />
        </AvailabilityProvider>
      </NextIntlClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

const text = () => container.textContent ?? "";
const emailInput = () => container.querySelector('input[type="email"]');

describe("the client portal's sign-in", () => {
  it("says email sign-in isn't set up where no code can be delivered", async () => {
    action.loadSignInOptions.mockResolvedValue({ ...NOTHING, github: true });
    await renderPortalSignIn();

    expect(text()).toContain(form.emailSignInIsntSet);
    expect(emailInput()).toBeNull();
    expect(text()).not.toContain(form.emailMeACode);
  });

  it("shows the email form where codes can be delivered", async () => {
    action.loadSignInOptions.mockResolvedValue({ ...NOTHING, email: true });
    await renderPortalSignIn();

    expect(emailInput()).not.toBeNull();
    expect(text()).toContain(form.emailMeACode);
    expect(text()).not.toContain(form.emailSignInIsntSet);
  });

  it("keeps the form when the server can't be asked, rather than guessing", async () => {
    action.loadSignInOptions.mockRejectedValue(new Error("offline"));
    await renderPortalSignIn();

    expect(emailInput()).not.toBeNull();
    expect(text()).not.toContain(form.emailSignInIsntSet);
  });
});
