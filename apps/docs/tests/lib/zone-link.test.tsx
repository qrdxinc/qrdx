// The docs site is one zone of qrdx.dev: links to docs pages stay in this app
// (next/link), and every other internal link loads the main app's page in
// full (components/zone-link.tsx, components/zone-router.tsx).
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZoneLink } from "@/components/zone-link";
import { useZoneRouter } from "@/components/zone-router";

// next/link marks its anchors, to tell them from plain <a> elements.
vi.mock("next/link", async (importOriginal) => {
  const { default: Link } = await importOriginal<typeof import("next/link")>();
  return {
    default: (props: ComponentProps<typeof Link>) => (
      <Link {...props} data-next-link="" />
    ),
  };
});

const router = {
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
};
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/docs",
  useRouter: () => router,
}));

describe("ZoneLink", () => {
  it("uses next/link for docs pages", () => {
    for (const href of ["/docs", "/docs/styles", "/docs/help?x=1#top"]) {
      expect(
        renderToStaticMarkup(<ZoneLink href={href}>x</ZoneLink>),
      ).toContain("data-next-link");
    }
  });

  it("uses a plain <a> for the rest of the site, without next/link's props", () => {
    // /es/docs/help was a docs page while the docs had translations; now it
    // redirects, which the main app answers.
    for (const href of [
      "/",
      "/pricing",
      "/playground?type=wifi",
      "/docs.md",
      "/es/docs/help",
    ]) {
      expect(
        renderToStaticMarkup(
          <ZoneLink href={href} prefetch={false} scroll={false}>
            x
          </ZoneLink>,
        ),
      ).toBe(`<a href="${href}">x</a>`);
    }
  });
});

let zoneRouter: ReturnType<typeof useZoneRouter> | undefined;

/** Keeps the router useZoneRouter returns while it renders. */
function CaptureRouter() {
  zoneRouter = useZoneRouter();
  return null;
}

describe("useZoneRouter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("navigates within the docs, and loads other pages in full", () => {
    const location = { assign: vi.fn(), replace: vi.fn() };
    vi.stubGlobal("window", { location });
    renderToStaticMarkup(<CaptureRouter />);

    zoneRouter?.push("/docs/styles");
    expect(router.push).toHaveBeenCalledWith("/docs/styles", undefined);

    zoneRouter?.push("/pricing");
    expect(location.assign).toHaveBeenCalledWith("/pricing");
    expect(router.push).toHaveBeenCalledTimes(1);

    zoneRouter?.replace("/community");
    expect(location.replace).toHaveBeenCalledWith("/community");

    zoneRouter?.prefetch("/pricing");
    expect(router.prefetch).not.toHaveBeenCalled();
    zoneRouter?.prefetch("/docs/help");
    expect(router.prefetch).toHaveBeenCalledWith("/docs/help", undefined);
  });
});
