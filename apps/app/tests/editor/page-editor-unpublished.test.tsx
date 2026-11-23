// @vitest-environment jsdom
// The page editor's unpublished changes (components/landing/editor): the
// floating "Not live yet" bar with Publish, and the question before a link
// in the app leaves the editor. In November 2026 most new PDF pages had
// their PDF uploaded and were never published: people left the editor (or
// opened the live page) thinking the upload was the last step, and scans
// kept opening the template.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { LeaveGuard, leavingHref } = await import(
  "@/components/landing/editor/leave-guard"
);
const { UnpublishedBar } = await import(
  "@/components/landing/editor/unpublished-bar"
);

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const HERE = new URL("https://qrdx.dev/dashboard/acme/pages/p1");

/** A click on `element`, as the guard's document listener sees it. */
function clickOn(element: Element, init: MouseEventInit = {}) {
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...init,
  });
  Object.defineProperty(event, "target", { value: element });
  return event;
}

function link(href: string, attrs: Record<string, string> = {}) {
  const anchor = document.createElement("a");
  anchor.setAttribute("href", href);
  for (const [name, value] of Object.entries(attrs)) {
    anchor.setAttribute(name, value);
  }
  return anchor;
}

describe("leavingHref", () => {
  it("returns where a same-site link goes", () => {
    expect(leavingHref(clickOn(link("/dashboard/acme/codes")), HERE)).toBe(
      "/dashboard/acme/codes",
    );
    expect(
      leavingHref(clickOn(link("https://qrdx.dev/pricing?from=x#top")), HERE),
    ).toBe("/pricing?from=x#top");
  });

  it("finds the link from an icon or text inside it", () => {
    const anchor = link("/dashboard/acme/pages");
    const icon = document.createElement("span");
    anchor.append(icon);
    expect(leavingHref(clickOn(icon), HERE)).toBe("/dashboard/acme/pages");
  });

  it("lets through links that don't leave this tab or this page", () => {
    expect(
      leavingHref(clickOn(link("/p/abc", { target: "_blank" })), HERE),
    ).toBeNull();
    expect(
      leavingHref(clickOn(link("/api/files/f1", { download: "" })), HERE),
    ).toBeNull();
    expect(
      leavingHref(clickOn(link("https://example.com/menu")), HERE),
    ).toBeNull();
    expect(leavingHref(clickOn(link("#")), HERE)).toBeNull();
    expect(
      leavingHref(clickOn(link("/dashboard/acme/pages/p1#blocks")), HERE),
    ).toBeNull();
    expect(
      leavingHref(clickOn(document.createElement("button")), HERE),
    ).toBeNull();
  });

  it("lets the browser handle modified and non-left clicks", () => {
    const anchor = link("/dashboard/acme/codes");
    expect(leavingHref(clickOn(anchor, { metaKey: true }), HERE)).toBeNull();
    expect(leavingHref(clickOn(anchor, { ctrlKey: true }), HERE)).toBeNull();
    expect(leavingHref(clickOn(anchor, { shiftKey: true }), HERE)).toBeNull();
    expect(leavingHref(clickOn(anchor, { button: 1 }), HERE)).toBeNull();
  });
});

describe("LeaveGuard", () => {
  let container: HTMLDivElement;
  let root: Root;
  let anchor: HTMLAnchorElement;
  // jsdom doesn't navigate: count the clicks that would have.
  let navigations = 0;
  const countNavigation = (event: MouseEvent) => {
    if (!event.defaultPrevented) navigations += 1;
    event.preventDefault();
  };

  beforeEach(() => {
    window.history.replaceState(null, "", "/dashboard/acme/pages/p1");
    router.push.mockClear();
    navigations = 0;
    container = document.createElement("div");
    anchor = link("/dashboard/acme/codes");
    anchor.textContent = "Codes";
    document.body.append(container, anchor);
    document.addEventListener("click", countNavigation);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.removeEventListener("click", countNavigation);
    document.body.replaceChildren();
  });

  const dialogTitle = () =>
    [...document.querySelectorAll("[role=alertdialog] h2")].map(
      (node) => node.textContent,
    );
  const button = (name: string) =>
    [...document.querySelectorAll("button")].find(
      (node) => node.textContent === name,
    );

  it("asks before a link leaves with unpublished changes, and goes on Leave", () => {
    act(() => root.render(<LeaveGuard active />));
    act(() => anchor.click());
    expect(navigations).toBe(0);
    expect(dialogTitle()).toEqual(["Leave without publishing?"]);
    expect(router.push).not.toHaveBeenCalled();

    act(() => button("Leave")?.click());
    expect(router.push).toHaveBeenCalledWith("/dashboard/acme/codes");
    expect(dialogTitle()).toEqual([]);
  });

  it("stays on Keep editing", () => {
    act(() => root.render(<LeaveGuard active />));
    act(() => anchor.click());
    act(() => button("Keep editing")?.click());
    expect(router.push).not.toHaveBeenCalled();
    expect(dialogTitle()).toEqual([]);
  });

  it("does nothing with nothing to publish", () => {
    act(() => root.render(<LeaveGuard active={false} />));
    act(() => anchor.click());
    expect(navigations).toBe(1);
    expect(dialogTitle()).toEqual([]);
  });
});

describe("UnpublishedBar", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.replaceChildren();
  });

  it("says the changes aren't live and publishes from the bar", () => {
    const onPublish = vi.fn();
    act(() =>
      root.render(
        <UnpublishedBar
          detail="Scans open the last published version until you publish."
          onPublish={onPublish}
          open
          publishing={false}
        />,
      ),
    );
    // The floating layer the app frame and "Get set up" make room for.
    expect(
      container
        .querySelector("[data-selection-bar]")
        ?.getAttribute("data-selection-bar"),
    ).toBe("open");
    expect(container.textContent).toContain(
      "Not live yet. Scans open the last published version until you publish.",
    );
    const panel = container.querySelector("[data-selection-bar-panel]");
    expect(panel?.hasAttribute("inert")).toBe(false);
    act(() => container.querySelector("button")?.click());
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("is hidden and out of reach with nothing to publish", () => {
    act(() =>
      root.render(
        <UnpublishedBar
          detail=""
          onPublish={() => {}}
          open={false}
          publishing={false}
        />,
      ),
    );
    expect(
      container
        .querySelector("[data-selection-bar]")
        ?.getAttribute("data-selection-bar"),
    ).toBe("closed");
    expect(
      container
        .querySelector("[data-selection-bar-panel]")
        ?.hasAttribute("inert"),
    ).toBe(true);
  });

  it("shows the publish in progress", () => {
    act(() =>
      root.render(
        <UnpublishedBar detail="" onPublish={() => {}} open publishing />,
      ),
    );
    const publish = container.querySelector("button");
    expect(publish?.textContent).toBe("Publishing...");
    expect(publish?.disabled).toBe(true);
  });
});
