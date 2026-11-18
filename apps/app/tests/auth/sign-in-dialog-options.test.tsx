// @vitest-environment jsdom
// The sign-in dialog asks the running server which ways in work
// (sign-in-options-action.ts), because a prerendered page carries the build's
// answer and a Docker image is built without its secrets. When that ask
// fails (a tab left open while the container was recreated, a network blip,
// a reverse proxy whose Host doesn't match Origin), the dialog used to take
// the build's "nothing works" for the server's answer and say "Sign-in isn't
// set up yet" on a server where GitHub or email codes work. Only an answer
// the server actually sent may say that; a failed ask offers a retry and the
// /sign-in page, which works the options out per request.
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
// Server actions the panel's other parts import; none runs here.
vi.mock("@/ee/sso/sign-in-offer", () => ({ ssoSignInOffer: vi.fn() }));
vi.mock("@/ee/sso/start-sso-sign-in", () => ({ startSsoSignIn: vi.fn() }));
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
  usePathname: () => "/playground",
  useSearchParams: () => new URLSearchParams(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const panel = en.auth.signInPanel;

const NOTHING: SignInOptions = {
  google: false,
  github: false,
  email: false,
  sso: false,
};

// What the root layout carries in a Docker image built without secrets:
// every way in looks off.
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
  vi.stubGlobal(
    "matchMedia",
    () =>
      ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

/** The panel as the dialog shows it: no options from the page. */
async function openDialog() {
  // Fresh modules each time: the panel keeps the server's answer for the
  // page load. The provider comes from the same fresh set, so the panel
  // reads its context.
  const { SignInPanel } = await import(
    "@/app/(app)/(auth)/components/sign-in-panel"
  );
  const { AvailabilityProvider } = await import(
    "@/components/availability-provider"
  );
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <AvailabilityProvider value={BUILD_VIEW}>
          <SignInPanel
            callbackURL={() => "/playground?tab=style"}
            Description={({ children }) => <p>{children}</p>}
            Title={({ children }) => <h2>{children}</h2>}
          />
        </AvailabilityProvider>
      </NextIntlClientProvider>,
    );
  });
  await settle();
}

const text = () => container.textContent ?? "";
const retryButton = () =>
  [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Try again",
  );

describe("the sign-in dialog when the server can't be asked", () => {
  it("never says sign-in isn't set up, and offers a retry and the sign-in page", async () => {
    action.loadSignInOptions.mockRejectedValue(
      new Error("Failed to find Server Action"),
    );
    await openDialog();

    expect(text()).not.toContain(panel.signInIsntSetUp);
    expect(text()).not.toContain(panel.thisSiteHasNoEmail);
    expect(container.querySelector('a[href="/docs/self-hosting"]')).toBeNull();
    expect(text()).toContain("We couldn't check how to sign in here.");
    expect(retryButton()).toBeDefined();
    // The page works the options out per request, without a server action,
    // and comes back here afterwards.
    expect(
      container.querySelector(
        `a[href="/sign-in?next=${encodeURIComponent("/playground?tab=style")}"]`,
      ),
    ).not.toBeNull();
  });

  it("asks again on retry and shows what the server says", async () => {
    action.loadSignInOptions.mockRejectedValueOnce(new Error("offline"));
    await openDialog();
    expect(retryButton()).toBeDefined();

    action.loadSignInOptions.mockResolvedValueOnce({
      ...NOTHING,
      github: true,
    });
    await act(async () => retryButton()?.click());
    await settle();

    expect(action.loadSignInOptions).toHaveBeenCalledTimes(2);
    expect(text()).toContain(panel.github);
    expect(text()).not.toContain("We couldn't check how to sign in here.");
    expect(text()).not.toContain(panel.signInIsntSetUp);
  });

  it("says sign-in isn't set up only when the server answered so", async () => {
    action.loadSignInOptions.mockResolvedValue(NOTHING);
    await openDialog();

    expect(text()).toContain(panel.signInIsntSetUp);
    expect(text()).toContain(panel.thisSiteHasNoEmail);
    expect(retryButton()).toBeUndefined();
  });
});
