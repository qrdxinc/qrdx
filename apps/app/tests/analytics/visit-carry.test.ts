// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://qrdx.dev/"}
// A visit carried between qrdx.dev's two apps (@repo/analytics/landing):
// the marketing site's pages are another app, so a link between them and
// this app's loads a new page, and the visit's start (and an affiliate's
// code) rides in that link's address, never in storage. The page it opens
// takes it only from a page of its own origin, records the start as the
// visit's, and takes the parameter out of the address bar.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  forgetPendingReferral,
  pendingReferralCode,
} from "@/lib/affiliates/referral-client";
import {
  captureLanding,
  forgetLanding,
  installVisitForwarding,
  signUpLanding,
  VISIT_PARAM,
  visitRef,
  withVisit,
} from "@/lib/analytics/landing";

/** Puts this "tab" on `href`, reached from `referrer`, as a new page. */
function openPage(href: string, referrer: string) {
  forgetLanding();
  forgetPendingReferral();
  window.history.replaceState(null, "", href);
  Object.defineProperty(document, "referrer", {
    configurable: true,
    value: referrer,
  });
}

function setPrivacySignal(on: boolean) {
  Object.defineProperty(navigator, "doNotTrack", {
    configurable: true,
    value: on ? "1" : null,
  });
}

/**
 * Clicks a link with `href` (and `attributes`) and returns the address the
 * browser would follow: the link's own address as the click ends. `type`
 * "auxclick" is a click with another button (the middle one opens a tab).
 */
function follow(
  href: string,
  options: {
    attributes?: Record<string, string>;
    init?: MouseEventInit;
    handledByPage?: boolean;
    type?: "click" | "auxclick";
  } = {},
): { followed: string; after: string | null } {
  const type = options.type ?? "click";
  const anchor = document.createElement("a");
  anchor.setAttribute("href", href);
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    anchor.setAttribute(name, value);
  }
  const label = document.createElement("span");
  label.textContent = "link";
  anchor.append(label);
  document.body.append(anchor);
  // next/link: handles the click itself, in React's listener (on the root,
  // before this one's).
  if (options.handledByPage) {
    anchor.addEventListener("click", (event) => event.preventDefault());
  }
  let followed = "";
  const record = (event: Event) => {
    followed = anchor.href;
    // jsdom can't load another document.
    event.preventDefault();
  };
  // Registered after installVisitForwarding's, so it sees what the browser
  // would follow.
  document.addEventListener(type, record);
  label.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      ...options.init,
    }),
  );
  document.removeEventListener(type, record);
  vi.runAllTimers();
  const after = anchor.getAttribute("href");
  anchor.remove();
  return { followed, after };
}

beforeEach(() => {
  vi.useFakeTimers();
  setPrivacySignal(false);
});

afterEach(() => {
  forgetLanding();
  forgetPendingReferral();
  vi.useRealTimers();
});

describe("a link to a page of the other app", () => {
  it("carries the visit's start and the affiliate's code to the sign-up", () => {
    openPage(
      "/blog/do-qr-codes-expire?utm_source=Newsletter&utm_campaign=Nov&ref=spring-sale",
      "https://www.google.com/search?q=do+qr+codes+expire",
    );
    captureLanding();
    installVisitForwarding();

    const { followed, after } = follow(
      "/sign-in?mode=signup&next=%2Fdashboard",
    );
    const url = new URL(followed);
    expect(url.pathname).toBe("/sign-in");
    expect(url.searchParams.get("mode")).toBe("signup");
    expect(url.searchParams.get("next")).toBe("/dashboard");
    expect(JSON.parse(url.searchParams.get(VISIT_PARAM) ?? "")).toEqual({
      referrer_host: "www.google.com",
      landing_path: "/blog/do-qr-codes-expire",
      utm_source: "newsletter",
      utm_campaign: "Nov",
      ref: "spring-sale",
    });
    // The link's own address is put back straight after.
    expect(after).toBe("/sign-in?mode=signup&next=%2Fdashboard");

    // The sign-in page, opened by that link.
    openPage(
      followed,
      "https://qrdx.dev/blog/do-qr-codes-expire?utm_source=Newsletter&utm_campaign=Nov&ref=spring-sale",
    );
    captureLanding();
    expect(signUpLanding()).toEqual({
      referrer_host: "www.google.com",
      landing_path: "/blog/do-qr-codes-expire",
      utm_source: "newsletter",
      utm_campaign: "Nov",
      ref: "spring-sale",
      signup_path: "/sign-in",
    });
    expect(visitRef()).toBe("spring-sale");
    expect(pendingReferralCode()).toBe("spring-sale");
    // Taken out of the address bar once read; the rest stays.
    vi.runAllTimers();
    expect(window.location.search).toBe("?mode=signup&next=%2Fdashboard");
    expect(signUpLanding()?.landing_path).toBe("/blog/do-qr-codes-expire");
    expect(pendingReferralCode()).toBe("spring-sale");
  });

  it("goes on carrying the first page's start, hop after hop", () => {
    openPage("/?utm_source=x", "https://news.ycombinator.com/");
    installVisitForwarding();
    const first = follow("/pricing").followed;
    openPage(first, "https://qrdx.dev/?utm_source=x");
    installVisitForwarding();
    const second = follow("/playground").followed;
    openPage(second, "https://qrdx.dev/pricing");
    expect(signUpLanding()).toEqual({
      referrer_host: "news.ycombinator.com",
      landing_path: "/",
      utm_source: "x",
      signup_path: "/playground",
    });
  });

  it("is taken only from a page of this origin", () => {
    const planted = `/sign-in?${VISIT_PARAM}=${encodeURIComponent(
      JSON.stringify({
        referrer_host: "partner.example",
        landing_path: "/pricing",
        ref: "someone",
      }),
    )}`;
    for (const referrer of ["https://evil.example/", ""]) {
      openPage(planted, referrer);
      captureLanding();
      expect(signUpLanding(), referrer).toEqual({
        ...(referrer ? { referrer_host: "evil.example" } : {}),
        landing_path: "/sign-in",
        signup_path: "/sign-in",
      });
      expect(visitRef(), referrer).toBeNull();
      expect(pendingReferralCode(), referrer).toBeNull();
      // Still taken out of the address bar.
      vi.runAllTimers();
      expect(window.location.search, referrer).toBe("");
    }
  });

  it("never counts a QRdx link's own tag as an affiliate's code", () => {
    openPage("/?ref=chrome-extension", "");
    installVisitForwarding();
    const { followed } = follow("/sign-in");
    openPage(followed, "https://qrdx.dev/?ref=chrome-extension");
    expect(visitRef()).toBe("chrome-extension");
    expect(pendingReferralCode()).toBeNull();
    expect(signUpLanding()?.ref).toBe("chrome-extension");
  });

  it("carries only the `ref` under Do Not Track, and records nothing", () => {
    setPrivacySignal(true);
    openPage("/?ref=spring-sale&utm_source=x", "https://github.com/");
    installVisitForwarding();
    const { followed } = follow("/sign-in");
    expect(
      JSON.parse(new URL(followed).searchParams.get(VISIT_PARAM) ?? ""),
    ).toEqual({ ref: "spring-sale" });
    openPage(followed, "https://qrdx.dev/?ref=spring-sale&utm_source=x");
    expect(signUpLanding()).toBeNull();
    expect(pendingReferralCode()).toBe("spring-sale");
  });
});

describe("a link opened in a new tab or window", () => {
  beforeEach(() => {
    openPage("/compare/qr-tiger?utm_source=x", "https://www.bing.com/");
    installVisitForwarding();
  });

  it("carries the visit too: Cmd, Ctrl or Shift held, the middle button, or target=_blank", () => {
    const opened = [
      follow("/sign-in", { init: { metaKey: true } }),
      follow("/sign-in", { init: { ctrlKey: true } }),
      follow("/sign-in", { init: { shiftKey: true } }),
      follow("/sign-in", { type: "auxclick", init: { button: 1 } }),
      follow("/sign-in", { attributes: { target: "_blank" } }),
      // next/link leaves a modified click to the browser.
      follow("/pricing", { init: { metaKey: true } }),
    ];
    for (const { followed, after } of opened) {
      const url = new URL(followed);
      expect(JSON.parse(url.searchParams.get(VISIT_PARAM) ?? "null")).toEqual({
        referrer_host: "www.bing.com",
        landing_path: "/compare/qr-tiger",
        utm_source: "x",
      });
      // The link's own address is back once the click is over.
      expect(after).toBe(url.pathname);
    }
  });

  it("still carries nothing to another site, a redirect or the docs", () => {
    for (const href of ["https://example.com/", "/q/aB3dE5f", "/docs"]) {
      for (const options of [
        { init: { metaKey: true } },
        { type: "auxclick" as const, init: { button: 1 } },
      ]) {
        const { followed } = follow(href, options);
        expect(new URL(followed).searchParams.has(VISIT_PARAM), href).toBe(
          false,
        );
      }
    }
  });
});

describe("links that carry nothing", () => {
  beforeEach(() => {
    openPage("/compare/qr-tiger?utm_source=x", "https://www.bing.com/");
    installVisitForwarding();
  });

  it("are links the page follows itself, saves, or opens somewhere else", () => {
    expect(follow("/compare", { handledByPage: true }).followed).toBe(
      "https://qrdx.dev/compare",
    );
    // Alt saves the link; a click event never comes from the middle button.
    for (const init of [{ altKey: true }, { button: 1 }]) {
      expect(follow("/sign-in", { init }).followed, JSON.stringify(init)).toBe(
        "https://qrdx.dev/sign-in",
      );
    }
    // A right-click opens a menu that could copy the address.
    expect(
      follow("/sign-in", { type: "auxclick", init: { button: 2 } }).followed,
    ).toBe("https://qrdx.dev/sign-in");
    for (const attributes of [
      { download: "" },
      { target: "preview" },
      { target: "_top" },
    ] as Record<string, string>[]) {
      expect(
        follow("/sign-in", { attributes }).followed,
        JSON.stringify(attributes),
      ).toBe("https://qrdx.dev/sign-in");
    }
  });

  it("go to another site, the same page, a redirect, an API, the docs or a file", () => {
    for (const href of [
      "https://example.com/",
      "https://api.qrdx.dev/v1/qr",
      "#pricing",
      "/compare/qr-tiger?utm_source=x#faq",
      "/q/aB3dE5f",
      "/p/menu",
      "/r/spring-sale",
      "/m/x",
      "/gs1/01/09506000134352",
      "/api/v1/qr",
      "/docs",
      "/docs/developers/rest-api",
      "/oauth/authorize",
      "/sign-out",
      "/sitemap.xml",
      "/pricing.md",
      "/site-static/_next/static/x.js",
    ]) {
      const { followed } = follow(href);
      expect(new URL(followed).searchParams.has(VISIT_PARAM), href).toBe(false);
    }
    // Every other page of the origin does.
    for (const href of ["/", "/home", "/pricing", "/playground", "/sign-in"]) {
      const { followed } = follow(href);
      expect(new URL(followed).searchParams.has(VISIT_PARAM), href).toBe(true);
    }
  });

  it("keep a visit a link already carries", () => {
    const own = `/sign-in?${VISIT_PARAM}=x`;
    expect(withVisit(own, window.location.href)).toBe(own);
  });

  it("carry nothing when there's nothing to carry", () => {
    setPrivacySignal(true);
    openPage("/pricing", "");
    installVisitForwarding();
    expect(follow("/sign-in").followed).toBe("https://qrdx.dev/sign-in");
  });
});
