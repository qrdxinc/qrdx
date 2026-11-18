// @vitest-environment jsdom
// Resending an email sign-in code past the per-address limit (5 in 15
// minutes). The server now refuses before it makes a new code
// (packages/auth/email-otp.ts, signInCodeGate), so the code already in the
// inbox keeps working. The form says so, and keeps the code box open, rather
// than only "Too many codes requested", which left people thinking their
// code was gone. Once that code has expired or used up its tries, the
// refusal is just a refusal.
import { NextIntlClientProvider } from "next-intl";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

const auth = vi.hoisted(() => ({
  sendVerificationOtp: vi.fn(),
  signInEmailOtp: vi.fn(),
}));

vi.mock("@repo/auth/client", () => ({
  authClient: {
    emailOtp: { sendVerificationOtp: auth.sendVerificationOtp },
    signIn: { emailOtp: auth.signInEmailOtp },
  },
}));
// Server actions the form's other parts import; none runs here.
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
  usePathname: () => "/sign-in",
  useSearchParams: () => new URLSearchParams(),
}));

const { EmailCodeSignIn } = await import(
  "@/app/(app)/(auth)/components/email-code-sign-in"
);

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const form = en.auth.emailCodeSignIn;
const SENT = { data: { success: true }, error: null };
const OVER_LIMIT = {
  data: null,
  error: { status: 429, code: "SIGN_IN_CODE_RATE_LIMITED" },
};

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** The form with the panel's part: it holds the address the code went to. */
function Harness() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  return (
    <EmailCodeSignIn
      onSentToChange={setSentTo}
      onSignedIn={() => undefined}
      sentTo={sentTo}
    />
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  // input-otp looks for password managers' badges; jsdom has no layout.
  document.elementFromPoint = () => null;
  auth.sendVerificationOtp.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

/** Asks for a code for `address`, which works; the code step is showing. */
async function sendFirstCode(address: string) {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <Harness />
      </NextIntlClientProvider>,
    );
  });
  const input = container.querySelector<HTMLInputElement>(
    'input[type="email"]',
  );
  if (!input) throw new Error("no email field");
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setValue?.call(input, address);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  auth.sendVerificationOtp.mockResolvedValueOnce(SENT);
  await act(async () => {
    container.querySelector("form")?.requestSubmit();
  });
  await wait(0);
}

async function resend() {
  // After the 30-second wait between codes.
  await wait(31_000);
  const button = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === form.resend,
  );
  if (!button) throw new Error("no Resend button");
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
  await wait(0);
}

const status = () => container.querySelector('[aria-live="polite"]');
const codeBox = () =>
  container.querySelector<HTMLInputElement>(
    'input[autocomplete="one-time-code"]',
  );

describe("resending past the per-address limit", () => {
  it("says the newest code in the inbox still works, and keeps the code box open", async () => {
    await sendFirstCode("ada@example.com");
    expect(codeBox()).not.toBeNull();

    auth.sendVerificationOtp.mockResolvedValueOnce(OVER_LIMIT);
    await resend();

    expect(auth.sendVerificationOtp).toHaveBeenCalledTimes(2);
    expect(status()?.textContent).toBe(form.tooManyCodesRequestedSo);
    // A note, not an error: nothing about the code is wrong.
    expect(status()?.getAttribute("role")).toBeNull();
    expect(codeBox()?.disabled).toBe(false);
  });

  it("just says too many once that code has expired", async () => {
    await sendFirstCode("ada@example.com");
    // Past the code's 5 minutes.
    await wait(5 * 60_000);

    auth.sendVerificationOtp.mockResolvedValueOnce(OVER_LIMIT);
    await resend();

    expect(status()?.textContent).toBe(form.tooManyCodesRequestedWait);
    expect(status()?.textContent).not.toContain("still works");
  });
});
