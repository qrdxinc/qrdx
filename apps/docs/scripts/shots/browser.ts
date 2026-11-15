// The browser the capture jobs drive: headless Chrome through the repo's
// own DevTools driver (apps/app/e2e/cdp.mjs; no Playwright), muted, closed
// at the end, with a fixed viewport at 2x, animations off and the caret
// hidden, so two runs of a job give the same picture.
import { readFileSync, statSync } from "node:fs";
import { launch, PAGE_HELPERS, sleep } from "../../../app/e2e/cdp.mjs";
import type { Box, Driver, Theme } from "./types";

type CdpPage = Awaited<ReturnType<typeof launch>>;

export interface BrowserOptions {
  baseUrl: string;
  /** The seeded workspace slug (dashboard URLs). */
  workspace: string;
  width?: number;
  height?: number;
  /** Device pixel ratio of the captures (stills 2, clips 2 with a size cap). */
  scale?: number;
  mobile?: boolean;
}

/** Dev-only chrome that must never appear in a picture, and all motion off. */
const CLEAN_CSS = `
nextjs-portal, .tsqd-open-btn-container, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }
*, *::before, *::after { caret-color: transparent !important; scroll-behavior: auto !important; }
`;
const STILL_CSS = `${CLEAN_CSS}
*, *::before, *::after {
  animation-duration: 0s !important; animation-delay: 0s !important;
  transition-duration: 0s !important; transition-delay: 0s !important;
}
`;

const KEYS: Record<string, { code: string; keyCode: number; text?: string }> = {
  Escape: { code: "Escape", keyCode: 27 },
  Enter: { code: "Enter", keyCode: 13, text: "\r" },
  Tab: { code: "Tab", keyCode: 9 },
  ArrowDown: { code: "ArrowDown", keyCode: 40 },
  ArrowUp: { code: "ArrowUp", keyCode: 38 },
  Backspace: { code: "Backspace", keyCode: 8 },
  " ": { code: "Space", keyCode: 32, text: " " },
};

/** What the capture server's own address is shown as (showProductionOrigin). */
const PRODUCTION_ORIGIN = "https://qrdx.dev";

/**
 * Page-side: the element a capture or a focus names. "card" is the bordered
 * container (a card, a panel, a fieldset) around the named text, label or
 * button: what a picture of "that section" should frame.
 */
const FIND_ELEMENT = `(find, name) => {
  let el;
  if (find === "text") el = window.__e2e.byText(name);
  else if (find === "label") el = window.__e2e.byLabel(name);
  else if (find === "css") el = document.querySelector(name);
  else if (find === "card") {
    el = window.__e2e.byText(name) ?? window.__e2e.byLabel(name) ?? window.__e2e.byRole("button", name);
    let node = el;
    for (let i = 0; node && i < 16; i++) {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      if (rect.width >= 480 && (Number.parseFloat(style.borderTopWidth) > 0 || style.boxShadow !== "none") && node !== document.body) { el = node; break; }
      node = node.parentElement;
    }
  }
  else el = window.__e2e.byRole(find, name);
  return el ?? null;
}`;

export class Browser {
  readonly page: CdpPage;
  readonly baseUrl: string;
  readonly ws: string;
  private motion = false;
  private theme: Theme = "light";

  readonly driver: Driver;

  private constructor(page: CdpPage, options: BrowserOptions) {
    this.page = page;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.ws = `/dashboard/${options.workspace}`;
    this.driver = this.makeDriver();
  }

  static async open(options: BrowserOptions): Promise<Browser> {
    const width = options.width ?? 1440;
    const height = options.height ?? 900;
    const page = await launch({ width, height });
    // A DevTools call can hang for good when a navigation destroys the
    // context it was evaluating in; every call gets a deadline instead.
    const send = page.cdp.send;
    page.cdp.send = (method: string, params?: Record<string, unknown>) =>
      Promise.race([
        send(method, params),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(new Error(`DevTools call ${method} took more than 120 s`)),
            120_000,
          ).unref(),
        ),
      ]);
    // A "Leave site?" prompt (an unsaved-changes guard) or any alert would
    // freeze the page for good: accept them as they open.
    page.cdp.on((message: { method?: string }) => {
      if (message.method === "Page.javascriptDialogOpening") {
        send("Page.handleJavaScriptDialog", { accept: true }).catch(
          () => undefined,
        );
      }
    });
    // A fixed place and language, so dates, times and the time zone the app
    // mentions never depend on the machine taking the pictures.
    await page.cdp.send("Emulation.setTimezoneOverride", {
      timezoneId: "Europe/Lisbon",
    });
    await page.cdp.send("Emulation.setLocaleOverride", { locale: "en-US" });
    const browser = new Browser(page, options);
    await browser.setViewport(
      width,
      height,
      options.scale ?? 2,
      options.mobile ?? false,
    );
    await browser.setTheme("light");
    return browser;
  }

  async close(): Promise<void> {
    await this.page.close();
  }

  async setViewport(
    width: number,
    height: number,
    scale = 2,
    mobile = false,
  ): Promise<void> {
    await this.page.cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: scale,
      mobile,
      ...(mobile && { screenWidth: width, screenHeight: height }),
    });
    if (mobile) {
      await this.page.cdp.send("Emulation.setTouchEmulationEnabled", {
        enabled: true,
        maxTouchPoints: 5,
      });
    } else {
      await this.page.cdp.send("Emulation.setTouchEmulationEnabled", {
        enabled: false,
      });
    }
  }

  /** Light or dark, through the OS preference (the app's theme setting is "system"). */
  async setTheme(theme: Theme): Promise<void> {
    this.theme = theme;
    await this.page.cdp.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-color-scheme", value: theme },
        {
          name: "prefers-reduced-motion",
          value: this.motion ? "no-preference" : "reduce",
        },
      ],
    });
  }

  /** Clips keep the app's own transitions; stills turn every animation off. */
  async setMotion(motion: boolean): Promise<void> {
    this.motion = motion;
    await this.setTheme(this.theme);
    await this.clean();
  }

  /** Adds (or refreshes) the capture stylesheet in the current document. */
  async clean(): Promise<void> {
    await this.page.evaluate(
      `(css) => {
        let style = document.getElementById("shots-clean");
        if (!style) { style = document.createElement("style"); style.id = "shots-clean"; document.head.appendChild(style); }
        style.textContent = css;
        return true;
      }`,
      this.motion ? CLEAN_CSS : STILL_CSS,
    );
  }

  /** Fonts loaded, two frames painted, the dev overlay hidden. */
  async settle(extra = 250): Promise<void> {
    await this.page.evaluate(`() => ${PAGE_HELPERS}`);
    await this.clean();
    await this.page.evaluate(
      `async () => { await document.fonts.ready; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return true; }`,
    );
    await sleep(extra);
  }

  /** Signs in as `email` through the sign-in page; the code is read from the dev server's log. */
  async signIn(email: string, devLog: string): Promise<void> {
    const since = statSync(devLog).size;
    await this.page.goto(`${this.baseUrl}/sign-in`, { wait: 1500 });
    await this.settle();
    await this.driver.waitText("Email me a code", 60_000);
    await this.driver.rejectCookies();
    await this.driver.fill("Email address", email);
    await this.driver.click("button", "Email me a code", { exact: true });
    const pattern = new RegExp(
      `sign-in code for ${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: (\\d{6})`,
    );
    let code: string | undefined;
    const started = Date.now();
    while (!code && Date.now() - started < 60_000) {
      const text = readFileSync(devLog).subarray(since).toString("utf8");
      code = pattern.exec(text)?.[1];
      if (!code) await sleep(250);
    }
    if (!code) throw new Error(`No sign-in code for ${email} in ${devLog}`);
    await this.driver.waitText("Check your email", 30_000);
    await this.driver.fill("Sign-in code", code);
    await this.page.waitFor(
      `() => location.pathname.startsWith("/dashboard")`,
      { timeout: 60_000 },
    );
    await this.settle(500);
  }

  /**
   * Makes room for a whole element: grows the viewport until the element
   * and `room` pixels around it fit, centres it, and checks that nothing
   * (a sticky header, the viewport's edge) covers any side of it. A picture
   * of a card must show the whole card, so this throws when it can't.
   */
  async fit(
    find: string,
    name: string,
    width: number,
    height: number,
    room: number,
  ): Promise<void> {
    let tall = height;
    for (let pass = 0; pass < 3; pass++) {
      const state = (await this.page.evaluate(
        `(find, name) => {
        const el = (${FIND_ELEMENT})(find, name);
        if (!el) return null;
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
        const r = el.getBoundingClientRect();
        const inside = (x, y) => { const hit = document.elementFromPoint(x, y); return !!hit && (el.contains(hit) || hit.contains(el)); };
        const cx = r.x + r.width / 2;
        const clear = r.width > 0 && r.height > 0 && r.x >= 0 && r.right <= window.innerWidth && r.y >= 0 && r.bottom <= window.innerHeight
          && inside(cx, r.y + 3) && inside(cx, r.bottom - 3) && inside(r.x + 3, r.y + r.height / 2) && inside(r.right - 3, r.y + r.height / 2);
        return { height: r.height, top: r.y, bottom: window.innerHeight - r.bottom, clear };
      }`,
        find,
        name,
      )) as {
        height: number;
        top: number;
        bottom: number;
        clear: boolean;
      } | null;
      if (!state) throw new Error(`No ${find} "${name}" to frame`);
      if (state.clear && state.top >= room && state.bottom >= room) return;
      // Room for the element, the margin and a sticky header on either side.
      tall = Math.max(tall, Math.ceil(state.height + room * 2 + 240));
      await this.setViewport(width, tall, 2, false);
      await sleep(400);
    }
    throw new Error(
      `${find} "${name}" doesn't fit in the picture whole: something covers it or it runs off the page`,
    );
  }

  /**
   * The app writes its own address into some screens (a referral link, the
   * client portal's address, a redirect URI). On qrdx.dev that address is
   * qrdx.dev; here it is the local capture server, which no reader has.
   * Shown as qrdx.dev, the picture is the screen a reader gets.
   */
  async showProductionOrigin(): Promise<void> {
    await this.page.evaluate(
      `(local, live) => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (node.nodeValue.includes(local)) node.nodeValue = node.nodeValue.replaceAll(local, live);
        }
        for (const field of document.querySelectorAll("input, textarea")) {
          if (field.value.includes(local)) field.value = field.value.replaceAll(local, live);
        }
        return true;
      }`,
      this.baseUrl,
      PRODUCTION_ORIGIN,
    );
  }

  /** A PNG of the viewport at the device pixel ratio. */
  async screenshot(): Promise<Buffer> {
    const { data } = (await this.page.cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    })) as { data: string };
    return Buffer.from(data, "base64");
  }

  /** The viewport size in CSS pixels. */
  async viewport(): Promise<{ width: number; height: number }> {
    return this.page.evaluate(
      `() => ({ width: window.innerWidth, height: window.innerHeight })`,
    ) as Promise<{
      width: number;
      height: number;
    }>;
  }

  // ─── What the jobs use ──────────────────────────────────────────────────

  private makeDriver(): Driver {
    return {
      baseUrl: this.baseUrl,
      ws: this.ws,
      open: async (route, options) => {
        const url = /^(https?|file):/.test(route)
          ? route
          : `${this.baseUrl}${route.replaceAll("{ws}", this.ws)}`;
        // Not the driver's goto(): on a busy dev server the load event can
        // take a minute to fire. The document is usable once it has parsed
        // and has text (a page the job wrote itself may be pictures only).
        await this.page
          .evaluate(`() => { window.__shotsLeaving = true; return true; }`)
          .catch(() => undefined);
        await this.page.cdp.send("Page.navigate", { url });
        await this.page.waitFor(
          `() => !window.__shotsLeaving && document.readyState !== "loading" && !!document.body && (location.protocol === "file:" || document.body.innerText.length > 0)`,
          { timeout: 90_000, interval: 250 },
        );
        await sleep(options?.wait ?? 1200);
        await this.settle(400);
        await this.driver.rejectCookies();
      },
      click: async (role, name, options) => {
        const ok = await this.page.evaluate(
          `(role, name, exact, within) => {
          const root = within ? (document.querySelector(within) ?? window.__e2e.byRole("dialog", within) ?? undefined) : undefined;
          const el = window.__e2e.byRole(role, name, { exact: !!exact, root }) ?? (exact ? null : window.__e2e.byRole(role, name, { root }));
          if (!el) return false;
          window.__e2e.click(el);
          return true;
        }`,
          role,
          name,
          options?.exact ?? false,
          options?.within ?? null,
        );
        if (!ok) throw new Error(`No ${role} "${name}"`);
        await sleep(this.motion ? 350 : 150);
      },
      clickText: async (text) => {
        const ok = await this.page.evaluate(
          `(text) => { const el = window.__e2e.byText(text); if (!el) return false; window.__e2e.click(el); return true; }`,
          text,
        );
        if (!ok) throw new Error(`No element with text "${text}"`);
        await sleep(this.motion ? 350 : 150);
      },
      pointerClick: async (find, name) => {
        const box = await this.driver.box(find, name);
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await this.page.cdp.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x,
          y,
        });
        await this.page.cdp.send("Input.dispatchMouseEvent", {
          type: "mousePressed",
          x,
          y,
          button: "left",
          clickCount: 1,
        });
        await this.page.cdp.send("Input.dispatchMouseEvent", {
          type: "mouseReleased",
          x,
          y,
          button: "left",
          clickCount: 1,
        });
        await sleep(this.motion ? 350 : 150);
      },
      fill: async (label, value) => {
        const ok = await this.page.evaluate(
          `(label, value) => {
          const el = window.__e2e.byLabel(label);
          if (!el) return false;
          el.focus();
          window.__e2e.setValue(el, value);
          return true;
        }`,
          label,
          value,
        );
        if (!ok) throw new Error(`No field "${label}"`);
        await sleep(100);
      },
      type: async (text) => {
        for (const char of text) {
          await this.page.cdp.send("Input.insertText", { text: char });
          await sleep(this.motion ? 45 + Math.random() * 40 : 5);
        }
      },
      press: async (key) => {
        const spec = KEYS[key] ?? {
          code: key,
          keyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
          text: key.length === 1 ? key : undefined,
        };
        await this.page.cdp.send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key,
          code: spec.code,
          windowsVirtualKeyCode: spec.keyCode,
          nativeVirtualKeyCode: spec.keyCode,
          ...(spec.text && { text: spec.text }),
        });
        await this.page.cdp.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key,
          code: spec.code,
          windowsVirtualKeyCode: spec.keyCode,
          nativeVirtualKeyCode: spec.keyCode,
        });
        await sleep(this.motion ? 250 : 120);
      },
      waitText: async (text, timeout = 20_000) => {
        await this.page.waitFor(`(t) => document.body.innerText.includes(t)`, {
          timeout,
          args: [text] as never[],
        });
      },
      waitFor: async (fn, timeout = 20_000) => {
        await this.page.waitFor(fn, { timeout });
      },
      pause: (ms) => sleep(ms),
      waitQuiet: async (timeout = 10_000) => {
        await this.page
          .waitFor(
            `() => {
            const text = document.body.innerText;
            if (/Checking scan|Loading…|Loading...|Saving…/.test(text)) return false;
            return !document.querySelector('[aria-busy="true"]');
          }`,
            { timeout },
          )
          .catch(() => undefined);
        await sleep(150);
      },
      evaluate: (fn, ...args) =>
        this.page.evaluate(fn, ...args) as Promise<never>,
      hover: async (role, name) => {
        const box = await this.driver.box(role, name);
        await this.page.cdp.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
        });
        await sleep(200);
      },
      scrollTo: async (role, name) => {
        const ok = await this.page.evaluate(
          `(role, name) => {
          const el = role === "text" ? window.__e2e.byText(name) : window.__e2e.byRole(role, name);
          if (!el) return false;
          el.scrollIntoView({ block: "start", behavior: "instant" });
          return true;
        }`,
          role,
          name,
        );
        if (!ok) throw new Error(`No ${role} "${name}" to scroll to`);
        await sleep(200);
      },
      scrollWindow: async (y) => {
        await this.page.evaluate(
          `(y) => { window.scrollTo({ top: y, behavior: "instant" }); return true; }`,
          y,
        );
        await sleep(150);
      },
      box: async (find, name) => {
        const box = (await this.page.evaluate(
          `(find, name) => {
          const el = (${FIND_ELEMENT})(find, name);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const radius = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
          return { x: r.x, y: r.y, width: r.width, height: r.height, radius };
        }`,
          find,
          name,
        )) as Box | null;
        if (!box) throw new Error(`No ${find} "${name}" to measure`);
        return box;
      },
      rejectCookies: async () => {
        await this.page.evaluate(
          `() => { const b = window.__e2e.byRole("button", "Reject all", { exact: true }); if (b) window.__e2e.click(b); return true; }`,
        );
        await sleep(150);
      },
    };
  }
}

export { sleep };
