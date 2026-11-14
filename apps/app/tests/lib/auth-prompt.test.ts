// Why the sign-in dialog opened: the reason travels from the gate to the
// dialog's line, to auth_prompt_shown / auth_prompt_dismissed, and to the
// sign_up or sign_in that follows. The browser is a stub; every event is
// read from the debug log, so nothing leaves the process.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

function installBrowser(path = "/playground") {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
  };
  storage.setItem("qrdx:analytics-debug", "1");
  const url = new URL(path, "http://localhost:3000");
  vi.stubGlobal("window", {
    location: {
      href: url.href,
      origin: url.origin,
      hostname: url.hostname,
      pathname: url.pathname,
      protocol: url.protocol,
    },
    localStorage: storage,
    sessionStorage: storage,
  });
  vi.stubGlobal("document", { cookie: "", referrer: "", title: "" });
  vi.stubGlobal("navigator", { doNotTrack: null });
  return { store };
}

/** Events sent so far, from track()'s debug log: [name, props]. */
function sentEvents(): [string, Record<string, unknown>][] {
  return (
    console.debug as unknown as { mock: { calls: unknown[][] } }
  ).mock.calls
    .filter((call) => call[0] === "[analytics:track]")
    .map((call) => [call[1] as string, call[2] as Record<string, unknown>]);
}

async function load() {
  vi.resetModules();
  // Registers the app's untracked pages, so track() may send.
  await import("@/lib/analytics/privacy");
  const prompt = await import("@repo/analytics/auth-prompt");
  const identity = await import("@repo/analytics/identity");
  const { useAuthStore } = await import("@/store/auth-store");
  return { ...prompt, ...identity, useAuthStore };
}

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("auth prompt reasons", () => {
  it("each has a line in the dialog, except a plain sign-in", async () => {
    const { AUTH_PROMPT_REASONS } = await import("@repo/analytics/auth-prompt");
    const { reasonLine } = await import(
      "@/app/(app)/(auth)/components/sign-in-reasons"
    );
    const lines = en.auth.reasons as Record<string, string>;
    const t = ((key: string, values?: Record<string, number>) => {
      const line = lines[key];
      if (!line) throw new Error(`auth.reasons.${key} is missing`);
      return Object.entries(values ?? {}).reduce(
        (text, [name, value]) =>
          text.replace(new RegExp(`\\{${name}, number\\}`), String(value)),
        line,
      );
    }) as unknown as Parameters<typeof reasonLine>[1];
    for (const reason of AUTH_PROMPT_REASONS) {
      const line = reasonLine(reason, t);
      if (reason === "nav") expect(line).toBeNull();
      else expect(line, reason).toMatch(/\S/);
    }
    expect(reasonLine("bulk_over_limit", t)).toContain("500");
    expect(reasonLine("ai_chat", t)).toContain("5");
  });

  it("cleans the surface down to a section name", async () => {
    const { cleanSurface, isAuthPromptReason } = await import(
      "@repo/analytics/auth-prompt"
    );
    expect(cleanSurface("tools/bulk")).toBe("tools/bulk");
    expect(cleanSurface("Header")).toBe("header");
    expect(cleanSurface("https://evil.example/x")).toBe("other");
    expect(cleanSurface("a//b")).toBe("other");
    expect(cleanSurface(42)).toBe("other");
    expect(isAuthPromptReason("save_design")).toBe(true);
    expect(isAuthPromptReason("pay_now")).toBe(false);
  });

  it("names where a prompt opened without naming a page", async () => {
    const { authPromptSurface } = await import("@/lib/analytics/auth-prompt");
    expect(authPromptSurface("/")).toBe("home");
    expect(authPromptSurface("/playground")).toBe("playground");
    expect(authPromptSurface("/playground/theme_abc123")).toBe("playground");
    expect(authPromptSurface("/es/pricing")).toBe("pricing");
    expect(authPromptSurface("/tools/bulk")).toBe("tools/bulk");
    expect(authPromptSurface("/ai/art")).toBe("ai/art");
    expect(authPromptSurface("/community/frames/my-frame")).toBe("community");
    expect(authPromptSurface("/dashboard/acme/codes?x=1")).toBe("dashboard");
    expect(authPromptSurface("/%E2%9C%93")).toBe("other");
    expect(authPromptSurface(null)).toBe("other");
  });

  it("opens as a sign-up unless the visitor asked to sign in or has before", async () => {
    const { defaultAuthMode, showsSignIn } = await import(
      "@/lib/analytics/auth-prompt"
    );
    expect(defaultAuthMode("nav")).toBe("signin");
    expect(defaultAuthMode("save_design")).toBe("auto");
    expect(defaultAuthMode("bulk_over_limit")).toBe("auto");
    // A first visit hears "Create your QRdx account", not "Pick up where you left off".
    expect(showsSignIn("auto", null)).toBe(false);
    expect(showsSignIn("auto", "google")).toBe(true);
    expect(showsSignIn("signup", "google")).toBe(false);
    expect(showsSignIn("signin", null)).toBe(true);
  });
});

describe("the dialog's reason", () => {
  it("is set by the gate, sent, and credited to the sign-up that follows", async () => {
    installBrowser("/playground");
    const { useAuthStore, syncAnalyticsSession, __resetIdentityForTests } =
      await load();
    __resetIdentityForTests();
    useAuthStore
      .getState()
      .openAuthDialog("save_design", { action: "SAVE_THEME" });
    expect(useAuthStore.getState()).toMatchObject({
      isOpen: true,
      mode: "auto",
      reason: "save_design",
      surface: "playground",
      postLoginAction: { type: "SAVE_THEME" },
      callbackURL: null,
    });
    expect(sentEvents()).toContainEqual([
      "auth_prompt_shown",
      { reason: "save_design", surface: "playground", kind: "dialog" },
    ]);

    // Signed in a moment later (a brand-new account).
    const now = Date.now();
    syncAnalyticsSession(
      {
        userId: "user_1",
        userCreatedAt: now - 1000,
        sessionCreatedAt: now - 500,
        organizationId: null,
      },
      () => "google",
    );
    expect(sentEvents()).toContainEqual([
      "sign_up",
      {
        method: "google",
        reason: "save_design",
        surface: "playground",
      },
    ]);
  });

  it("is forgotten when the visitor closes the dialog", async () => {
    installBrowser("/tools/bulk");
    const {
      useAuthStore,
      syncAnalyticsSession,
      takeAuthPrompt,
      __resetIdentityForTests,
    } = await load();
    __resetIdentityForTests();
    useAuthStore
      .getState()
      .openAuthDialog("bulk_over_limit", { action: "BULK_GENERATE" });
    useAuthStore.getState().dismissAuthDialog();
    expect(useAuthStore.getState()).toMatchObject({
      isOpen: false,
      postLoginAction: null,
    });
    expect(sentEvents()).toContainEqual([
      "auth_prompt_dismissed",
      { reason: "bulk_over_limit", surface: "tools/bulk", kind: "dialog" },
    ]);
    expect(takeAuthPrompt()).toBeNull();

    // A later sign-in elsewhere isn't credited to it.
    const now = Date.now();
    syncAnalyticsSession(
      {
        userId: "user_2",
        userCreatedAt: now - 86_400_000,
        sessionCreatedAt: now - 500,
        organizationId: null,
      },
      () => "email-otp",
    );
    expect(sentEvents()).toContainEqual(["sign_in", { method: "email-otp" }]);
  });

  it("keeps a page to land on, and the chrome's own surface", async () => {
    installBrowser("/pricing");
    const { useAuthStore } = await load();
    useAuthStore.getState().openSignInTo("/barcode-generator", "save_barcode");
    expect(useAuthStore.getState()).toMatchObject({
      reason: "save_barcode",
      mode: "auto",
      callbackURL: "/barcode-generator",
      postLoginAction: null,
    });
    useAuthStore.getState().closeAuthDialog();
    useAuthStore
      .getState()
      .openAuthDialog("nav", { surface: "header", callbackURL: "/dashboard" });
    expect(useAuthStore.getState()).toMatchObject({
      mode: "signin",
      surface: "header",
      callbackURL: "/dashboard",
    });
  });

  it("isn't credited once it's stale, and only once", async () => {
    const { rememberAuthPrompt, takeAuthPrompt, AUTH_PROMPT_MAX_AGE_MS } =
      await import("@repo/analytics/auth-prompt");
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    } as unknown as Storage;
    rememberAuthPrompt({ reason: "ai_art", surface: "ai/art" }, 1000, storage);
    expect(takeAuthPrompt(1000 + AUTH_PROMPT_MAX_AGE_MS + 1, storage)).toBe(
      null,
    );
    rememberAuthPrompt({ reason: "ai_art", surface: "ai/art" }, 1000, storage);
    expect(takeAuthPrompt(2000, storage)).toEqual({
      reason: "ai_art",
      surface: "ai/art",
    });
    expect(takeAuthPrompt(2000, storage)).toBeNull();
    store.set("qrdx:auth-prompt", '{"reason":"pay_now","at":1000}');
    expect(takeAuthPrompt(2000, storage)).toBeNull();
    store.set("qrdx:auth-prompt", "not json");
    expect(takeAuthPrompt(2000, storage)).toBeNull();
  });
});
