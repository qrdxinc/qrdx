// @vitest-environment jsdom
// "Confirm it's you" with a passkey, while the page re-renders under it.
// Asking for the passkey prompt sets the plugin's challenge cookie in a
// Server Action, and Next.js then re-renders the page and its layouts, which
// hands the dialog new translation functions (the catalog arrives as a new
// object). That must not count as the dialog opening again: when it did, each
// re-render reset the dialog and started a new prompt, aborting the one on
// screen, and the next challenge cookie re-rendered the page once more. The
// passkey prompt looped every couple of seconds until "Too many tries"
// (20 challenges in 15 minutes), and no one with a passkey could confirm.
import { NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

const calls = vi.hoisted(() => ({
  getConfirmationOptions: vi.fn(),
  startPasskeyConfirmation: vi.fn(),
  confirmWithPasskey: vi.fn(),
  getPasskeyAssertion: vi.fn(),
  aborted: 0,
}));

vi.mock("@/components/confirm-identity/actions", () => ({
  getConfirmationOptions: calls.getConfirmationOptions,
  startPasskeyConfirmation: calls.startPasskeyConfirmation,
  confirmWithPasskey: calls.confirmWithPasskey,
  confirmWithCode: vi.fn(),
  confirmWithEmailCode: vi.fn(),
  sendConfirmationCode: vi.fn(),
  startSignInConfirmation: vi.fn(),
  finishSignInConfirmation: vi.fn(),
  ensureConfirmed: vi.fn(),
}));
vi.mock("@/components/confirm-identity/webauthn", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/components/confirm-identity/webauthn")
  >()),
  getPasskeyAssertion: calls.getPasskeyAssertion,
}));
vi.mock("@/lib/passkeys", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/passkeys")>()),
  browserHasPasskeys: () => true,
}));

const { ConfirmIdentityDialog } = await import(
  "@/components/confirm-identity/confirm-identity-dialog"
);

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const request = { action: "create-api-key" as const };
const onDone = vi.fn();

let container: HTMLDivElement;
let root: Root;

/**
 * The dialog as the page renders it. Each call is one render from the
 * server: the catalog is a new object every time, as after a Server Action
 * set a cookie.
 */
function renderFromServer() {
  root.render(
    <NextIntlClientProvider
      locale="en"
      messages={structuredClone(en)}
      timeZone="UTC"
    >
      <ConfirmIdentityDialog onDone={onDone} request={request} />
    </NextIntlClientProvider>,
  );
}

const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  calls.aborted = 0;
  calls.getConfirmationOptions.mockReset().mockResolvedValue({
    ok: true,
    options: {
      methods: ["passkey", "email"],
      maskedEmail: "r…@example.com",
      mailProvider: null,
    },
  });
  calls.startPasskeyConfirmation.mockReset().mockResolvedValue({
    ok: true,
    options: { challenge: "Y2hhbGxlbmdl", allowCredentials: [{ id: "a2V5" }] },
  });
  calls.confirmWithPasskey.mockReset();
  // The platform's prompt stays open (the person is reaching for Touch ID)
  // until it's aborted.
  calls.getPasskeyAssertion.mockReset().mockImplementation(
    (_options: unknown, signal?: AbortSignal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          calls.aborted += 1;
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
  );
  onDone.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('"Confirm it\'s you" with a passkey', () => {
  it("opens one passkey prompt, however often the page re-renders", async () => {
    await act(async () => renderFromServer());
    await settle();
    expect(calls.startPasskeyConfirmation).toHaveBeenCalledTimes(1);
    expect(calls.getPasskeyAssertion).toHaveBeenCalledTimes(1);

    // The challenge cookie re-renders the page; then a few more renders.
    for (let i = 0; i < 4; i++) {
      await act(async () => renderFromServer());
      await settle();
    }

    expect(calls.getConfirmationOptions).toHaveBeenCalledTimes(1);
    expect(calls.startPasskeyConfirmation).toHaveBeenCalledTimes(1);
    expect(calls.getPasskeyAssertion).toHaveBeenCalledTimes(1);
    expect(calls.aborted).toBe(0);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("still starts afresh when it's closed and opened again", async () => {
    await act(async () => renderFromServer());
    await settle();
    await act(async () =>
      root.render(
        <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
          <ConfirmIdentityDialog onDone={onDone} request={null} />
        </NextIntlClientProvider>,
      ),
    );
    await settle();
    expect(calls.aborted).toBe(1);

    await act(async () => renderFromServer());
    await settle();
    expect(calls.getConfirmationOptions).toHaveBeenCalledTimes(2);
    expect(calls.startPasskeyConfirmation).toHaveBeenCalledTimes(2);
  });

  it("says so when the options can't be loaded, in the page's language", async () => {
    calls.getConfirmationOptions
      .mockReset()
      .mockRejectedValue(new Error("offline"));
    await act(async () => renderFromServer());
    await settle();
    await act(async () => renderFromServer());
    await settle();
    expect(document.body.textContent).toContain(
      en.auth.confirmationMessages.failed,
    );
    expect(calls.getConfirmationOptions).toHaveBeenCalledTimes(1);
  });
});
