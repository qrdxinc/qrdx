// @vitest-environment jsdom
// The frame every tabbed community view shares (components/community/
// community-shell.tsx, drawn by app/(app)/(home)/community/layout.tsx): one
// tab row, the same tabs in the same order on every view, decided from
// what's published rather than from the page; the header's heading for the
// view; and a tab chosen shows at once, with its view's loading placeholder,
// before the route has changed.
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

const route = vi.hoisted(() => ({ segments: [] as string[] }));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useSelectedLayoutSegments: () => route.segments,
  useSearchParams: () => new URLSearchParams("q=wifi"),
}));
// Outside Next's router: a plain link that reports a client navigation the
// way next/link's onNavigate does.
vi.mock("next/link", () => ({
  default: ({
    href,
    onNavigate,
    children,
    scroll: _scroll,
    prefetch: _prefetch,
    ...props
  }: {
    href: string;
    onNavigate?: () => void;
    children: ReactNode;
    scroll?: boolean;
    prefetch?: boolean;
  }) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onNavigate?.();
      }}
    >
      {children}
    </a>
  ),
}));

const { CommunityShell } = await import(
  "@/components/community/community-shell"
);
const { HEADINGS, TABS, viewOf, visibleTabs } = await import(
  "@/components/community/community-views"
);

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ALL_PUBLISHED = { collections: true, templates: true, kits: true };

let container: HTMLDivElement;
let root: Root;
let animate: ReturnType<typeof vi.fn>;
let reduced = false;

beforeEach(() => {
  route.segments = [];
  reduced = false;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  animate = vi.fn();
  Element.prototype.animate =
    animate as unknown as typeof Element.prototype.animate;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("reduce") ? reduced : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  // jsdom lays nothing out: give every tab a box, each one further right.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const link = this.closest("a");
      const index = link
        ? [...(link.parentElement?.children ?? [])].indexOf(link)
        : 0;
      return {
        left: index * 80,
        x: index * 80,
        top: 400,
        y: 400,
        width: 64,
        height: 2,
        right: index * 80 + 64,
        bottom: 402,
        toJSON() {},
      } as DOMRect;
    },
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function render(published = ALL_PUBLISHED) {
  act(() =>
    root.render(
      <NextIntlClientProvider locale="en" messages={en}>
        <CommunityShell
          actions={<span>actions</span>}
          field={<pre aria-hidden>field</pre>}
          footer={<p>licence</p>}
          tabs={visibleTabs(published)}
        >
          <div data-testid="view">the view</div>
        </CommunityShell>
      </NextIntlClientProvider>,
    ),
  );
}

const tabRow = () =>
  container.querySelector<HTMLElement>('nav[aria-label="Community"]');
const tabLabels = () =>
  [...(tabRow()?.querySelectorAll("a") ?? [])].map((a) => a.textContent);
const activeTab = () =>
  tabRow()?.querySelector('[aria-current="page"]')?.textContent ?? null;

const VIEWS: { segments: string[]; tab: string }[] = [
  { segments: ["(overview)"], tab: "Overview" },
  { segments: ["all"], tab: "All" },
  { segments: ["frames", "(gallery)"], tab: "Frames" },
  { segments: ["themes", "(gallery)"], tab: "Themes" },
  { segments: ["collections", "(gallery)"], tab: "Collections" },
  { segments: ["templates", "(gallery)"], tab: "Page templates" },
  { segments: ["kits", "(gallery)"], tab: "Kits" },
];

describe("the tab set", () => {
  it("keeps every tab, in order, when everything is published", () => {
    expect(visibleTabs(ALL_PUBLISHED).map((tab) => tab.id)).toEqual(
      TABS.map((tab) => tab.id),
    );
  });

  it("drops only the tabs with nothing published, never reordering", () => {
    const tabs = visibleTabs({
      collections: true,
      templates: false,
      kits: false,
    });
    expect(tabs.map((tab) => tab.label)).toEqual([
      "Overview",
      "All",
      "Frames",
      "Themes",
      "Collections",
    ]);
  });

  it("maps each route below /community to its view, and the rest to none", () => {
    expect(viewOf([])).toBe("home");
    expect(viewOf(["(overview)"])).toBe("home");
    expect(viewOf(["all"])).toBe("all");
    expect(viewOf(["frames", "(gallery)"])).toBe("frames");
    expect(viewOf(["templates", "(gallery)"])).toBe("templates");
    // An item, a profile, the wall, the new collection form, no such type.
    expect(viewOf(["frames", "wifi-card"])).toBeNull();
    expect(viewOf(["u", "ana"])).toBeNull();
    expect(viewOf(["made-with-qrdx"])).toBeNull();
    expect(viewOf(["new"])).toBeNull();
    expect(viewOf(["nope", "(gallery)"])).toBeNull();
  });
});

describe("the shared frame", () => {
  it("draws the same tab row on every view, with that view's tab current", () => {
    const rows = VIEWS.map(({ segments, tab }) => {
      route.segments = segments;
      render();
      expect(activeTab()).toBe(tab);
      return tabLabels();
    });
    for (const labels of rows) expect(labels).toEqual(rows[0]);
    expect(rows[0]).toEqual(TABS.map((tab) => tab.label));
  });

  it("decides the tabs from what's published, not from the view", () => {
    const published = { collections: true, templates: false, kits: false };
    const rows = VIEWS.map(({ segments }) => {
      route.segments = segments;
      render(published);
      return tabLabels();
    });
    for (const labels of rows) expect(labels).toEqual(rows[0]);
    // On a gallery whose tab isn't shown, no tab is current.
    route.segments = ["kits", "(gallery)"];
    render(published);
    expect(activeTab()).toBeNull();
  });

  it("titles the header for the view", () => {
    route.segments = ["themes", "(gallery)"];
    render();
    expect(container.querySelector("h1")?.textContent).toBe(
      HEADINGS.themes.title,
    );
    route.segments = ["(overview)"];
    render();
    expect(container.querySelector("h1")?.textContent).toBe(
      HEADINGS.home.title,
    );
  });

  it("fills the search with the query on All, and nowhere else", () => {
    route.segments = ["all"];
    render();
    expect(container.querySelector<HTMLInputElement>("input")?.value).toBe(
      "wifi",
    );
    route.segments = ["frames", "(gallery)"];
    render();
    expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("");
  });

  it("leaves other pages under /community alone", () => {
    route.segments = ["frames", "wifi-card"];
    render();
    expect(tabRow()).toBeNull();
    expect(container.querySelector("h1")).toBeNull();
    expect(container.textContent).toBe("the view");
  });
});

describe("choosing a tab", () => {
  const click = (label: string) => {
    const link = [...(tabRow()?.querySelectorAll("a") ?? [])].find(
      (a) => a.textContent === label,
    );
    act(() => link?.click());
  };

  it("underlines it and shows its view's placeholder before the route changes", () => {
    route.segments = ["(overview)"];
    render();
    click("Frames");
    expect(activeTab()).toBe("Frames");
    expect(container.querySelector("h1")?.textContent).toBe(
      HEADINGS.frames.title,
    );
    // The old view is hidden, the gallery's placeholder is in its place.
    const view = container.querySelector('[data-testid="view"]');
    expect(view?.parentElement?.hidden).toBe(true);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      en.community.more.loading,
    );
    // The underline slides over from Overview.
    expect(animate).toHaveBeenCalledTimes(1);
    // From Overview's box (first) to Frames' (third): two tabs to the left.
    const [keyframes] = animate.mock.calls[0] as [Keyframe[]];
    expect(keyframes[0]).toEqual({ transform: "translateX(-160px) scaleX(1)" });
    expect(keyframes[1]).toEqual({ transform: "none" });

    // The route arrives: the view shows, the placeholder goes.
    route.segments = ["frames", "(gallery)"];
    render();
    expect(activeTab()).toBe("Frames");
    expect(view?.parentElement?.hidden).toBe(false);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("moves the underline without sliding under reduced motion", () => {
    reduced = true;
    route.segments = ["frames", "(gallery)"];
    render();
    click("Themes");
    expect(activeTab()).toBe("Themes");
    expect(animate).not.toHaveBeenCalled();
  });

  it("does nothing new for the tab already shown", () => {
    route.segments = ["all"];
    render();
    click("All");
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });
});
