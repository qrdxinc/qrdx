// @vitest-environment jsdom
// Settings → Account → Email. Where this deployment can't deliver codes at
// all, Settings says so instead of offering a change that can't work.
import { NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

vi.mock("@/app/(app)/settings/account/_lib/email-change-actions", () => ({
  requestEmailChange: vi.fn(),
  confirmEmailChange: vi.fn(),
}));
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

const { ProfileSection } = await import(
  "@/app/(app)/settings/account/_components/profile-section"
);

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const profile = en.app.settings.account.profileSection;
const CURRENT = "ada@qrdx.test";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const render = (node: React.ReactNode) =>
  act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        {node}
      </NextIntlClientProvider>,
    );
  });

const text = () => document.body.textContent ?? "";
const button = (label: string) =>
  [...document.body.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );

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
