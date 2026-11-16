// /oauth/confirm: "Confirm it's you" for the back-office console at its own
// address (ADMIN_CONSOLE_URL), outside /admin. A 404 while the console isn't
// set up here, and for anyone signed in who isn't an admin; signed out, to
// sign in and back; a held session, to the session check and back; an admin
// without two-step verification is told to turn it on (no dialog); an admin
// with it gets the dialog, which returns to `next` only when it's a page at
// exactly the console's address (else the console's front page): never
// another host, a protocol-relative URL, credentials or another port. The
// guard, the session and the two-step switch are mocked; nothing touches a
// database or a service. (The check the dialog runs, and its 10 minutes:
// console-confirm-window.test.ts. The redirect from /admin/confirm:
// tests/lib/admin-console-config.test.ts.)
import { notFound } from "next/navigation";
import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const CONSOLE = "https://console.qrdx.dev";

const state = vi.hoisted(() => ({
  consoleUrl: "https://console.qrdx.dev" as string | undefined,
  secret: "k".repeat(32) as string | undefined,
  admin: null as null | { id: string; email: string; name: string },
  session: null as null | { userId: string; sessionId: string; held: boolean },
  twoFactor: true,
}));

vi.mock("@/env", async (importOriginal) => {
  const { env } = await importOriginal<typeof import("@/env")>();
  return {
    env: new Proxy(env, {
      get: (target, key) => {
        if (key === "ADMIN_CONSOLE_URL") return state.consoleUrl;
        if (key === "CONSOLE_ZONE_KEY") return state.secret;
        return target[key as keyof typeof target];
      },
    }),
  };
});
vi.mock("@/app/(app)/admin/_lib/guard", () => ({
  getAdminUser: vi.fn(async () => state.admin),
  requireAdmin: vi.fn(async () => {
    if (!state.admin) notFound();
    return state.admin;
  }),
  assertAdmin: vi.fn(async () => {
    if (!state.admin) throw new Error("Not found");
    return state.admin;
  }),
}));
vi.mock("@/lib/account/confirmation-server", () => ({
  currentSession: vi.fn(async () =>
    state.session
      ? {
          ...state.session,
          email: "x@example.com",
          sessionCreatedAt: new Date(),
          requestHeaders: new Headers(),
        }
      : null,
  ),
  hasRecentStrongConfirmation: vi.fn(async () => false),
}));
vi.mock("@/lib/account/two-factor-server", () => ({
  twoFactorEnabledFor: vi.fn(async () => state.twoFactor),
}));

const { default: ConsoleConfirmPage } = await import(
  "@/app/(app)/oauth/confirm/page"
);
const { ConsoleConfirm, TwoFactorFirst } = await import(
  "@/app/(app)/oauth/confirm/console-confirm"
);

const render = (next?: string | string[]) =>
  ConsoleConfirmPage({
    searchParams: Promise.resolve(next === undefined ? {} : { next }),
  });

interface Found {
  kind: "confirm" | "two-factor";
  /** Where it goes once confirmed (none without two-step verification) */
  next?: string;
  /** Where "Go back" goes */
  cancel: string;
}

/** The client part the page renders, and the addresses it hands it. */
function found(node: ReactNode): Found | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = found(child);
      if (hit) return hit;
    }
    return undefined;
  }
  if (!isValidElement(node)) return undefined;
  const props = node.props as {
    next?: string;
    cancel?: string;
    children?: ReactNode;
  };
  if (node.type === ConsoleConfirm) {
    return {
      kind: "confirm",
      next: props.next as string,
      cancel: props.cancel as string,
    };
  }
  if (node.type === TwoFactorFirst) {
    return { kind: "two-factor", cancel: props.cancel as string };
  }
  return found(props.children);
}

/** Where a redirect() thrown by the page goes. */
async function redirectedTo(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  const digest = String((error as { digest?: unknown } | null)?.digest ?? "");
  expect(digest).toMatch(/^NEXT_REDIRECT;/);
  return digest.split(";")[2] as string;
}

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };
const ADMIN = { id: "u_admin", email: "admin@example.com", name: "A" };

beforeEach(() => {
  state.consoleUrl = CONSOLE;
  state.secret = "k".repeat(32);
  state.admin = null;
  state.session = null;
  state.twoFactor = true;
});

describe("/oauth/confirm", () => {
  it("is a 404 while the console isn't set up here, whoever asks", async () => {
    state.admin = ADMIN;
    state.session = { userId: ADMIN.id, sessionId: "s1", held: false };
    for (const [url, secret] of [
      [undefined, "k".repeat(32)],
      [CONSOLE, undefined],
      [CONSOLE, "k".repeat(31)],
    ] as const) {
      state.consoleUrl = url;
      state.secret = secret;
      await expect(render(`${CONSOLE}/growth`)).rejects.toMatchObject(
        NOT_FOUND,
      );
    }
  });

  it("sends a signed-out visitor to sign in, and back here", async () => {
    const next = `${CONSOLE}/affiliates/abc?confirmed=1`;
    const to = await redirectedTo(render(next));
    const signIn = new URL(to, "https://qrdx.dev");
    expect(signIn.pathname).toBe("/sign-in");
    expect(signIn.searchParams.get("next")).toBe(
      `/oauth/confirm?next=${encodeURIComponent(next)}`,
    );
  });

  it("signs in towards the console's front page when `next` is no good", async () => {
    const to = await redirectedTo(render("https://evil.example/"));
    expect(new URL(to, "https://qrdx.dev").searchParams.get("next")).toBe(
      `/oauth/confirm?next=${encodeURIComponent(`${CONSOLE}/`)}`,
    );
  });

  it("sends a held session to the session check first, and back here", async () => {
    state.admin = ADMIN;
    state.session = { userId: ADMIN.id, sessionId: "s1", held: true };
    const to = await redirectedTo(render(`${CONSOLE}/growth`));
    const check = new URL(to, "https://qrdx.dev");
    expect(check.pathname).toBe("/session-check");
    expect(check.searchParams.get("next")).toBe(
      `/oauth/confirm?next=${encodeURIComponent(`${CONSOLE}/growth`)}`,
    );
  });

  it("gives anyone signed in who isn't an admin a 404", async () => {
    state.session = { userId: "u_someone", sessionId: "s1", held: false };
    await expect(render(`${CONSOLE}/growth`)).rejects.toMatchObject(NOT_FOUND);
  });

  it("gives a 404 when the session and the admin check disagree", async () => {
    state.admin = ADMIN;
    state.session = { userId: "u_other", sessionId: "s1", held: false };
    await expect(render(`${CONSOLE}/growth`)).rejects.toMatchObject(NOT_FOUND);
  });

  describe("for an admin", () => {
    beforeEach(() => {
      state.admin = ADMIN;
      state.session = { userId: ADMIN.id, sessionId: "s1", held: false };
    });

    it("without two-step verification: no dialog, where to turn it on", async () => {
      state.twoFactor = false;
      expect(found(await render(`${CONSOLE}/growth?confirmed=1`))).toEqual({
        kind: "two-factor",
        cancel: `${CONSOLE}/growth`,
      });
    });

    it.each([
      [
        `${CONSOLE}/affiliates/abc?page=2&confirmed=1`,
        `${CONSOLE}/affiliates/abc?page=2`,
      ],
      [`${CONSOLE}/users/u_1?confirmed=1`, `${CONSOLE}/users/u_1`],
      [`${CONSOLE}/search?q=maria`, `${CONSOLE}/search?q=maria`],
      [`${CONSOLE}/growth`, `${CONSOLE}/growth`],
      [`${CONSOLE}/`, `${CONSOLE}/`],
    ])("goes back to the console page %s", async (next, cancel) => {
      expect(found(await render(next))).toEqual({
        kind: "confirm",
        next,
        cancel,
      });
    });

    it("goes back without the console's \"just confirmed\" marker, so a cancel isn't read as a confirmation", async () => {
      const hit = found(
        await render(`${CONSOLE}/affiliates/abc?confirmed=1&page=2`),
      );
      expect(hit?.next).toBe(`${CONSOLE}/affiliates/abc?confirmed=1&page=2`);
      expect(new URL(hit?.cancel ?? "").searchParams.has("confirmed")).toBe(
        false,
      );
    });

    it.each([
      [undefined],
      [""],
      [["https://console.qrdx.dev/growth", "https://evil.example/"]],
      ["https://evil.example/growth"],
      ["https://console.qrdx.dev.evil.example/growth"],
      ["https://console.qrdx.dev@evil.example/growth"],
      ["https://user:pass@console.qrdx.dev/growth"],
      ["https://console.qrdx.dev:8443/growth"],
      ["http://console.qrdx.dev/growth"],
      ["//console.qrdx.dev/growth"],
      ["//evil.example/growth"],
      ["/\\evil.example/growth"],
      ["/admin/growth"],
      ["/growth"],
      ["https://admin.qrdx.dev/growth"],
      ["https://qrdx.dev/settings/account"],
      [`${CONSOLE}/auth/logout`],
      [`${CONSOLE}/growth/../auth/login`],
      ["javascript:alert(1)"],
      [`${CONSOLE}//auth/logout`],
      [`${CONSOLE}/%61uth/login`],
      [`${CONSOLE}/auth%2flogin`],
    ])("goes back to the console's front page for %j", async (next) => {
      expect(found(await render(next))).toEqual({
        kind: "confirm",
        next: `${CONSOLE}/`,
        cancel: `${CONSOLE}/`,
      });
    });
  });
});
