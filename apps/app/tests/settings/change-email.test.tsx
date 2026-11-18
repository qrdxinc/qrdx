// @vitest-environment jsdom
// Settings → Account → Email. Asking for a code for a new address answers
// "sent" whether or not one went out: Better Auth sends nothing when another
// account already has the address (so the form can't be used to look
// addresses up), and a send that fails can't be told apart from that without
// giving it away. So the dialog only says a code should arrive if no other
// account uses the address. Where this deployment can't deliver codes at all,
// Settings says so instead of offering the change.
import { NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

const actions = vi.hoisted(() => ({
  requestEmailChange: vi.fn(),
  confirmEmailChange: vi.fn(),
}));

vi.mock(
  "@/app/(app)/settings/account/_lib/email-change-actions",
  () => actions,
);
vi.mock("@/app/(app)/settings/account/_lib/actions", () => ({
  removeAvatar: vi.fn(),
  updateProfileName: vi.fn(),
  uploadAvatar: vi.fn(),
}));
vi.mock("@repo/auth/client", () => ({
  authClient: { useSession: () => ({ refetch: async () => undefined }) },
}));
// "Confirm it's you" is tested on its own; here every action is confirmed.
vi.mock("@/components/confirm-identity/provider", () => ({
  useConfirmation: () => ({
    withConfirmation: <T,>(run: () => Promise<T>) => run(),
  }),
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

const { ChangeEmailDialog } = await import(
  "@/app/(app)/settings/account/_components/change-email-dialog"
);
const { ProfileSection } = await import(
  "@/app/(app)/settings/account/_components/profile-section"
);

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const dialog = en.app.settings.account.changeEmailDialog;
const profile = en.app.settings.account.profileSection;
const CURRENT = "ada@qrdx.test";
const NEW = "ada@example.com";

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  // input-otp looks for password managers' badges; jsdom has no layout.
  document.elementFromPoint = () => null;
  actions.requestEmailChange.mockReset();
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

const render = (node: React.ReactNode) =>
  act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        {node}
      </NextIntlClientProvider>,
    );
  });

const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

// The dialog renders into a portal on document.body.
const text = () => document.body.textContent ?? "";
const button = (label: string) =>
  [...document.body.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );

/** Opens the dialog and asks for a code for `address`; the server says "sent". */
async function askForCode(address: string) {
  await render(
    <ChangeEmailDialog currentEmail={CURRENT} onOpenChange={() => {}} open />,
  );
  const input = document.body.querySelector<HTMLInputElement>(
    'input[type="email"]',
  );
  if (!input) throw new Error("no email field");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, address);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  actions.requestEmailChange.mockResolvedValueOnce({ ok: true });
  await act(async () => {
    input.form?.requestSubmit();
  });
  await wait(0);
  expect(actions.requestEmailChange).toHaveBeenCalledWith({
    newEmail: address,
  });
}

describe("after asking for a code", () => {
  it("says a code should arrive only if no other account uses the address", async () => {
    await askForCode(NEW);
    expect(text()).toContain(
      dialog.ifNoOtherQrdxAccount.replace("{sentTo}", NEW),
    );
    expect(text()).toContain(dialog.noCodeCheckSpamIf);
    // Never that one was sent: it may not have been.
    expect(text()).not.toMatch(/we sent/i);
    // The code step itself is unchanged.
    expect(
      document.body.querySelector('input[autocomplete="one-time-code"]'),
    ).not.toBeNull();
    expect(button(dialog.changeEmail)).toBeDefined();
  });

  it("says a new code was asked for, not that it was sent, after a resend", async () => {
    await askForCode(NEW);
    // After the 30-second wait between codes.
    await wait(31_000);
    const resend = button(dialog.resendCode);
    if (!resend) throw new Error("no Resend button");
    actions.requestEmailChange.mockResolvedValueOnce({ ok: true });
    await act(async () => resend.click());
    await wait(0);
    expect(actions.requestEmailChange).toHaveBeenCalledTimes(2);
    expect(text()).toContain(dialog.newCodeRequestedAnyEarlier);
    expect(text()).not.toMatch(/code sent/i);
  });
});

describe("the email row in Settings", () => {
  const view = (canChangeEmail: boolean) => ({
    name: "Ada",
    email: CURRENT,
    emailVerified: true,
    image: null,
    memberSince: "1 Nov 2026",
    canUpload: false,
    canChangeEmail,
  });

  it("says email isn't set up instead of offering a change that can't work", async () => {
    await render(<ProfileSection profile={view(false)} />);
    expect(text()).toContain(profile.emailIsntSetUpOn);
    expect(button(profile.change)).toBeUndefined();
    expect(text()).toContain(CURRENT);
  });

  it("offers the change where codes can be delivered", async () => {
    await render(<ProfileSection profile={view(true)} />);
    expect(button(profile.change)).toBeDefined();
    expect(text()).not.toContain(profile.emailIsntSetUpOn);
  });
});
