// @vitest-environment jsdom
// A signed-out visitor who came for a dynamic code (open=dynamic) sees the
// editor first: the address field ready and a "Create dynamic code" button
// under it, which asks for sign-up only when pressed, with the address as
// the post-login action so the code is made right after
// (lib/playground-apply.ts, components/editor/dynamic-link-toggle.tsx).
// Also the Dynamic choice's own rules: only an address the URL form accepts,
// never "it worked" for a code saved switched off, a notice when a resume
// doesn't apply, and one code per pick in a tab.
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

const state = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
}));
const routes = vi.hoisted(() => ({
  createDynamicCode: vi.fn(),
  updateDynamicCode: vi.fn(),
}));
const toasts = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  });
  return { toast };
});

vi.mock("@repo/auth/client", () => ({
  authClient: {
    useSession: () => ({ data: state.session, isPending: false }),
  },
}));
vi.mock("@/lib/widget-routes/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/widget-routes/client")>()),
  ...routes,
}));
vi.mock("@repo/design-system", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/design-system")>()),
  toast: toasts.toast,
}));

import { UrlForm } from "@/components/editor/content-forms/url-form";
import {
  DynamicLinkToggle,
  useDynamicLinkStore,
  useHeldDynamicStore,
} from "@/components/editor/dynamic-link-toggle";
import { makeDynamicIntent } from "@/components/editor/dynamic-resume";
import { executePostLoginAction } from "@/lib/hooks/use-post-login-action";
import { useAuthStore } from "@/store/auth-store";
import { useQREditorStore } from "@/store/editor-store";
import {
  useEndDynamicPickWhenSignedIn,
  usePlaygroundFocusStore,
} from "@/store/playground-focus-store";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render(node: ReactNode) {
  act(() => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        {node}
      </NextIntlClientProvider>,
    );
  });
}

function remount(node: ReactNode) {
  act(() => root.unmount());
  root = createRoot(container);
  render(node);
}

/** Lets the transition's awaits settle. */
async function settle() {
  await act(async () => {
    for (let step = 0; step < 5; step++) await Promise.resolve();
  });
}

const setUrl = (url: string) =>
  useQREditorStore.setState({
    contentType: "url",
    value: url,
    contentConfigs: { url: { type: "url", url } },
  });

const buttonWith = (text: string) =>
  [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text),
  ) ?? null;
const createButton = () => buttonWith("Create dynamic code");
const dynamicChoice = () =>
  container.querySelector<HTMLButtonElement>(
    'button[role="radio"][value="dynamic"]',
  ) ??
  [
    ...container.querySelectorAll<HTMLButtonElement>('button[role="radio"]'),
  ].find((button) => button.textContent?.includes("Dynamic")) ??
  null;

const CREATED = {
  id: "code_1",
  slug: "abc1234",
  shortLink: "https://qrdx.dev/q/abc1234",
  destinationUrl: "https://example.com/menu",
  status: "active",
};

/** Desktop (a mouse) or a touch screen, for the address field's focus. */
function pointer(fine: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: query === "(pointer: fine)" ? fine : false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

beforeEach(() => {
  state.session = null;
  usePlaygroundFocusStore.setState({ dynamicPick: false, addressFocus: false });
  useAuthStore.setState({ isOpen: false, postLoginAction: null });
  useDynamicLinkStore.setState({ code: null });
  useHeldDynamicStore.setState({ code: null });
  setUrl("");
  routes.createDynamicCode.mockReset();
  routes.updateDynamicCode.mockReset();
  toasts.toast.mockClear();
  toasts.toast.success.mockClear();
  toasts.toast.warning.mockClear();
  toasts.toast.error.mockClear();
  window.sessionStorage.clear();
  pointer(true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Create dynamic code (open=dynamic, signed out)", () => {
  it("waits for an address", () => {
    usePlaygroundFocusStore.getState().pickDynamic();
    render(<DynamicLinkToggle />);
    expect(createButton()?.disabled).toBe(true);
    expect(container.textContent).toContain(
      "Add your website address above first.",
    );
  });

  it("stays off for an address the form rejects (no domain ending)", () => {
    usePlaygroundFocusStore.getState().pickDynamic();
    setUrl("mycompany");
    render(<DynamicLinkToggle />);
    expect(createButton()?.disabled).toBe(true);
    expect(dynamicChoice()?.disabled).toBe(true);
    act(() => createButton()?.click());
    expect(useAuthStore.getState().isOpen).toBe(false);
  });

  it("asks for sign-up only when pressed, keeping the address for after", () => {
    usePlaygroundFocusStore.getState().pickDynamic();
    setUrl("example.com/menu");
    render(<DynamicLinkToggle />);
    expect(useAuthStore.getState().isOpen).toBe(false);
    const button = createButton();
    expect(button?.disabled).toBe(false);

    act(() => button?.click());
    expect(useAuthStore.getState()).toMatchObject({
      isOpen: true,
      reason: "make_dynamic",
      postLoginAction: {
        type: "MAKE_DYNAMIC",
        data: { destination: "https://example.com/menu" },
      },
    });
  });

  it("isn't shown without the pick, as before", () => {
    setUrl("https://example.com/menu");
    render(<DynamicLinkToggle />);
    expect(createButton()).toBeNull();
    expect(container.textContent).toContain("Dynamic needs a free account.");
  });

  it("isn't shown signed in (open=dynamic opens the builder there)", () => {
    state.session = { user: { id: "u_alice" } };
    usePlaygroundFocusStore.getState().pickDynamic();
    setUrl("https://example.com/menu");
    render(<DynamicLinkToggle />);
    expect(createButton()).toBeNull();
  });
});

/** The playground's session hand-off (lib/hooks/use-playground-params.ts). */
function SessionHarness({ signedIn }: { signedIn: boolean }) {
  useEndDynamicPickWhenSignedIn(signedIn);
  return null;
}

describe("the pick's lifetime", () => {
  it("ends once there's a session, so a later sign-out doesn't bring it back", () => {
    usePlaygroundFocusStore.getState().pickDynamic();
    render(<SessionHarness signedIn={false} />);
    expect(usePlaygroundFocusStore.getState().dynamicPick).toBe(true);
    render(<SessionHarness signedIn />);
    expect(usePlaygroundFocusStore.getState()).toMatchObject({
      dynamicPick: false,
      addressFocus: false,
    });
    render(<SessionHarness signedIn={false} />);
    expect(usePlaygroundFocusStore.getState().dynamicPick).toBe(false);
  });

  it("ends when the code is made", async () => {
    state.session = { user: { id: "u_alice" } };
    usePlaygroundFocusStore.setState({ dynamicPick: true });
    setUrl("https://example.com/menu");
    routes.createDynamicCode.mockResolvedValue({
      success: true,
      data: CREATED,
    });
    render(<DynamicLinkToggle />);
    act(() => dynamicChoice()?.click());
    await settle();
    expect(useDynamicLinkStore.getState().code?.id).toBe("code_1");
    expect(usePlaygroundFocusStore.getState().dynamicPick).toBe(false);
  });
});

describe("a code saved switched off (held for a safety check)", () => {
  beforeEach(() => {
    state.session = { user: { id: "u_alice" } };
    setUrl("https://example.com/menu");
  });

  it("isn't linked and never says it worked", async () => {
    routes.createDynamicCode.mockResolvedValue({
      success: true,
      data: { ...CREATED, status: "disabled" },
    });
    render(<DynamicLinkToggle />);
    act(() => dynamicChoice()?.click());
    await settle();
    expect(routes.createDynamicCode).toHaveBeenCalledTimes(1);
    expect(useDynamicLinkStore.getState().code).toBeNull();
    // The QR code still encodes the address, not the switched-off short link.
    expect(useQREditorStore.getState().value).toBe("https://example.com/menu");
    expect(toasts.toast.success).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Saved, but not live yet");
    expect(container.textContent).toContain("Don't print it yet");
    expect(container.querySelector('a[href*="codes/code_1"]')).not.toBeNull();
  });

  it("keeps Dynamic off for that address, even after a remount, until the address changes", async () => {
    routes.createDynamicCode.mockResolvedValue({
      success: true,
      data: { ...CREATED, status: "disabled" },
    });
    render(<DynamicLinkToggle />);
    act(() => dynamicChoice()?.click());
    await settle();
    expect(dynamicChoice()?.disabled).toBe(true);
    act(() => dynamicChoice()?.click());
    await settle();
    expect(routes.createDynamicCode).toHaveBeenCalledTimes(1);

    // Switching tabs remounts the toggle: still off, card still there.
    remount(<DynamicLinkToggle />);
    expect(dynamicChoice()?.disabled).toBe(true);
    expect(container.textContent).toContain("Saved, but not live yet");

    // Another address: Dynamic works again, the card goes.
    act(() => setUrl("https://example.com/other"));
    expect(dynamicChoice()?.disabled).toBe(false);
    expect(container.textContent).not.toContain("Saved, but not live yet");

    // Back to the held address: off again.
    act(() => setUrl("https://example.com/menu"));
    expect(dynamicChoice()?.disabled).toBe(true);
  });

  it("doesn't block another account signed in on this browser", () => {
    useHeldDynamicStore.setState({
      code: {
        id: "code_9",
        shortLink: "https://qrdx.dev/q/zzz9999",
        destinationUrl: "https://example.com/menu",
        userId: "u_bob",
      },
    });
    render(<DynamicLinkToggle />);
    expect(dynamicChoice()?.disabled).toBe(false);
    expect(container.textContent).not.toContain("Saved, but not live yet");
  });
});

describe("pointing a linked code to a new address", () => {
  beforeEach(() => {
    state.session = { user: { id: "u_alice" } };
    setUrl("https://example.com/menu");
    useDynamicLinkStore.setState({
      code: {
        id: "code_1",
        shortLink: "https://qrdx.dev/q/abc1234",
        destinationUrl: "https://example.com/old",
        userId: "u_alice",
      },
    });
  });

  const update = async () => {
    render(<DynamicLinkToggle />);
    act(() => buttonWith("Point it to the new address")?.click());
    await settle();
    expect(routes.updateDynamicCode).toHaveBeenCalledTimes(1);
  };

  it("a live code: printed copies open the new address", async () => {
    routes.updateDynamicCode.mockResolvedValue({
      success: true,
      data: { ...CREATED, paused: false },
    });
    await update();
    expect(toasts.toast.success).toHaveBeenCalledWith(
      "Destination updated",
      expect.objectContaining({
        description: "Printed copies of this code now open the new URL.",
      }),
    );
  });

  it("a switched-off code (held or moderated) doesn't claim printed copies work", async () => {
    routes.updateDynamicCode.mockResolvedValue({
      success: true,
      data: { ...CREATED, status: "disabled" },
    });
    await update();
    expect(toasts.toast.success).not.toHaveBeenCalled();
    expect(toasts.toast.warning).toHaveBeenCalledWith(
      "Saved, but this code is switched off",
      {
        description:
          "Printed copies won't open anything until it's back on. Your dashboard shows why.",
      },
    );
  });

  it("a code its owner paused says it's paused, not that printed copies open the new address", async () => {
    routes.updateDynamicCode.mockResolvedValue({
      success: true,
      data: { ...CREATED, status: "active", paused: true },
    });
    await update();
    expect(toasts.toast.warning).not.toHaveBeenCalled();
    expect(toasts.toast.success).toHaveBeenCalledWith(
      "Destination updated",
      expect.objectContaining({
        description: expect.stringContaining("This code is paused"),
      }),
    );
    expect(toasts.toast.success).not.toHaveBeenCalledWith(
      "Destination updated",
      expect.objectContaining({
        description: "Printed copies of this code now open the new URL.",
      }),
    );
  });
});

describe("back from sign-in with a Dynamic pick", () => {
  beforeEach(() => {
    state.session = { user: { id: "u_alice" } };
  });

  const resumeWith = async (destination: string, at = Date.now()) => {
    await act(async () => {
      await executePostLoginAction({
        type: "MAKE_DYNAMIC",
        data: makeDynamicIntent(destination, at),
      });
    });
    await settle();
  };

  it("makes the code for the same address", async () => {
    setUrl("https://example.com/menu");
    routes.createDynamicCode.mockResolvedValue({
      success: true,
      data: CREATED,
    });
    render(<DynamicLinkToggle />);
    await resumeWith("https://example.com/menu");
    expect(routes.createDynamicCode).toHaveBeenCalledTimes(1);
    expect(toasts.toast.success).toHaveBeenCalled();
  });

  it("says so when the address changed meanwhile", async () => {
    setUrl("https://example.com/other");
    render(<DynamicLinkToggle />);
    await resumeWith("https://example.com/menu");
    expect(routes.createDynamicCode).not.toHaveBeenCalled();
    expect(toasts.toast).toHaveBeenCalledWith(
      "Your QR code is still static",
      expect.objectContaining({
        description: expect.stringContaining("Pick Dynamic again"),
      }),
    );
  });

  it("runs a pick once in this tab (a restored page doesn't make a second code)", async () => {
    setUrl("https://example.com/menu");
    // Held, so nothing gets linked: only the mark stops the second run.
    routes.createDynamicCode.mockResolvedValue({
      success: true,
      data: { ...CREATED, status: "disabled" },
    });
    render(<DynamicLinkToggle />);
    const at = Date.now();
    await resumeWith("https://example.com/menu", at);
    remount(<DynamicLinkToggle />);
    await resumeWith("https://example.com/menu", at);
    expect(routes.createDynamicCode).toHaveBeenCalledTimes(1);
  });
});

describe("the address field with the dynamic pick", () => {
  const input = () => container.querySelector<HTMLInputElement>("#url-input");

  it("is focused once on a desktop, not again on a remount", () => {
    usePlaygroundFocusStore.getState().pickDynamic();
    render(<UrlForm />);
    expect(document.activeElement).toBe(input());

    input()?.blur();
    remount(<UrlForm />);
    expect(document.activeElement).not.toBe(input());
    // The button stays for the pick.
    expect(usePlaygroundFocusStore.getState().dynamicPick).toBe(true);
  });

  it("isn't focused on a touch screen, or without the pick", () => {
    pointer(false);
    usePlaygroundFocusStore.getState().pickDynamic();
    render(<UrlForm />);
    expect(document.activeElement).not.toBe(input());

    pointer(true);
    usePlaygroundFocusStore.setState({
      dynamicPick: false,
      addressFocus: false,
    });
    remount(<UrlForm />);
    expect(document.activeElement).not.toBe(input());
  });
});
