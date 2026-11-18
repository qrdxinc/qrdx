// @vitest-environment jsdom
// A signed-out visitor who came for a dynamic code (open=dynamic) sees the
// editor first: the address field ready and a "Create dynamic code" button
// under it, which asks for sign-up only when pressed, with the address as
// the post-login action so the code is made right after
// (lib/playground-apply.ts, components/editor/dynamic-link-toggle.tsx).
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

const state = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
}));

vi.mock("@repo/auth/client", () => ({
  authClient: {
    useSession: () => ({ data: state.session, isPending: false }),
  },
}));

import { UrlForm } from "@/components/editor/content-forms/url-form";
import { DynamicLinkToggle } from "@/components/editor/dynamic-link-toggle";
import { useAuthStore } from "@/store/auth-store";
import { useQREditorStore } from "@/store/editor-store";
import { usePlaygroundFocusStore } from "@/store/playground-focus-store";

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

const setUrl = (url: string) =>
  useQREditorStore.setState({
    contentType: "url",
    value: url,
    contentConfigs: { url: { type: "url", url } },
  });

const createButton = () =>
  [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Create dynamic code"),
  ) ?? null;

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
  usePlaygroundFocusStore.setState({ dynamicPick: false });
  useAuthStore.setState({ isOpen: false, postLoginAction: null });
  setUrl("");
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
    usePlaygroundFocusStore.setState({ dynamicPick: true });
    render(<DynamicLinkToggle />);
    expect(createButton()?.disabled).toBe(true);
    expect(container.textContent).toContain(
      "Add your website address above first.",
    );
  });

  it("asks for sign-up only when pressed, keeping the address for after", () => {
    usePlaygroundFocusStore.setState({ dynamicPick: true });
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
    usePlaygroundFocusStore.setState({ dynamicPick: true });
    setUrl("https://example.com/menu");
    render(<DynamicLinkToggle />);
    expect(createButton()).toBeNull();
  });
});

describe("the address field with the dynamic pick", () => {
  const input = () => container.querySelector<HTMLInputElement>("#url-input");

  it("is focused on a desktop", () => {
    usePlaygroundFocusStore.setState({ dynamicPick: true });
    render(<UrlForm />);
    expect(document.activeElement).toBe(input());
  });

  it("isn't focused on a touch screen, or without the pick", () => {
    pointer(false);
    usePlaygroundFocusStore.setState({ dynamicPick: true });
    render(<UrlForm />);
    expect(document.activeElement).not.toBe(input());

    act(() => root.unmount());
    root = createRoot(container);
    pointer(true);
    usePlaygroundFocusStore.setState({ dynamicPick: false });
    render(<UrlForm />);
    expect(document.activeElement).not.toBe(input());
  });
});
