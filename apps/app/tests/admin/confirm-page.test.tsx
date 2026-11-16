// /admin/confirm: "Confirm it's you" for the proxied back-office console's
// actions (CONSOLE_ORIGIN). Admins only (anyone else gets the admin pages'
// 404), and it only ever sends an admin back to a console page on this site
// (/admin/<section>): any other `next`, the console's own address included,
// returns to /admin. With ADMIN_CONSOLE_URL set, next.config.ts redirects
// this URL to /oauth/confirm (tests/oauth/console-confirm-page.test.tsx).
// The guard is mocked; nothing touches a database or a service.
import { notFound } from "next/navigation";
import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  admin: null as null | { id: string; email: string; name: string },
}));

const CONSOLE = "https://console.qrdx.dev";

vi.mock("@/env", async (importOriginal) => {
  const { env } = await importOriginal<typeof import("@/env")>();
  return {
    env: {
      ...env,
      ADMIN_CONSOLE_URL: CONSOLE,
      CONSOLE_ZONE_KEY: "k".repeat(32),
    },
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

const { default: AdminConfirmPage } = await import(
  "@/app/(app)/admin/confirm/page"
);
const { ConfirmAndReturn } = await import(
  "@/app/(app)/admin/confirm/confirm-and-return"
);

const render = (next?: string | string[]) =>
  AdminConfirmPage({
    searchParams: Promise.resolve(next === undefined ? {} : { next }),
  });

/** The `next` the page hands its client part, found in the element tree. */
function returnPath(node: ReactNode): string | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = returnPath(child);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement(node)) return undefined;
  const props = node.props as { next?: string; children?: ReactNode };
  if (node.type === ConfirmAndReturn) return props.next;
  return returnPath(props.children);
}

beforeEach(() => {
  state.admin = null;
});

describe("/admin/confirm", () => {
  it("gives anyone but an admin a 404", async () => {
    await expect(render("/admin/growth")).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });

  describe("for an admin", () => {
    beforeEach(() => {
      state.admin = { id: "u_admin", email: "admin@example.com", name: "A" };
    });

    it.each([
      ["/admin/affiliates/abc?page=2", "/admin/affiliates/abc?page=2"],
      ["/admin/growth", "/admin/growth"],
    ])("goes back to the console page %s", async (next, expected) => {
      expect(returnPath(await render(next))).toBe(expected);
    });

    it.each([
      [undefined],
      [""],
      ["/admin/users/u1"],
      ["https://evil.example/admin/growth"],
      ["//evil.example/admin/growth"],
      [`${CONSOLE}/`],
      [`${CONSOLE}/auth/login`],
      [`${CONSOLE}/users/u1`],
      // The console's own address confirms on /oauth/confirm instead.
      [`${CONSOLE}/growth`],
      [`${CONSOLE}/affiliates/abc?page=2`],
      ["https://evil.example/growth"],
      ["https://console.qrdx.dev.evil.example/growth"],
      ["//console.qrdx.dev/growth"],
      [["/admin/growth", "/admin/numbers"]],
    ])("falls back to /admin for %j", async (next) => {
      expect(returnPath(await render(next))).toBe("/admin");
    });
  });
});
