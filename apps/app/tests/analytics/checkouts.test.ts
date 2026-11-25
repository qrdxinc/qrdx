// The checkouts the app opened (lib/analytics/checkouts.ts, checkout_session)
// against the in-memory database: one row per Polar checkout, keyed by
// Polar's checkout id (which a paid subscription carries), with who, the
// plan, the period, the surface and the currency; written again it stays
// one row; and nothing that can throw into checkout, including the table
// not existing yet.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  errors: [] as Record<string, unknown>[],
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  // No request here: write now.
  after: () => {
    throw new Error("outside a request");
  },
}));
vi.mock("@/lib/log-error", () => ({
  logError: (_error: Error, context: Record<string, unknown>) => {
    state.errors.push(context);
  },
}));

import { database } from "@repo/database";
import { addCheckout, recordCheckout } from "@/lib/analytics/checkouts";
import { fakeDb } from "../support/fake-db";

const AT = new Date("2026-11-25T10:00:00Z");
const checkout = {
  id: "chk_1",
  userId: "u_ana",
  plan: "pro",
  interval: "year",
  surface: "limit_dialog",
  currency: "inr",
  now: AT,
} as const;

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.unique("checkoutSession", "id");
  state.errors = [];
});

describe("checkout_session", () => {
  it("records who opened which checkout, from where, under Polar's id", async () => {
    expect(await addCheckout(checkout)).toBe("recorded");
    expect(fakeDb.rows("checkoutSession")).toEqual([
      {
        id: "chk_1",
        userId: "u_ana",
        plan: "pro",
        interval: "year",
        surface: "limit_dialog",
        currency: "inr",
        createdAt: AT,
      },
    ]);
  });

  it("keeps one row per checkout", async () => {
    await addCheckout(checkout);
    expect(await addCheckout({ ...checkout, surface: "pricing_page" })).toBe(
      "already_recorded",
    );
    expect(fakeDb.rows("checkoutSession")).toHaveLength(1);
    expect(fakeDb.rows("checkoutSession")[0]?.surface).toBe("limit_dialog");
  });

  it("stores no currency when checkout fell back to Polar's default", async () => {
    await addCheckout({ ...checkout, id: "chk_2", currency: undefined });
    expect(fakeDb.find("checkoutSession", { id: "chk_2" })?.currency).toBe(
      null,
    );
  });

  it("writes outside a request straight away", async () => {
    recordCheckout({ ...checkout, now: undefined });
    await vi.waitFor(() =>
      expect(fakeDb.rows("checkoutSession")).toHaveLength(1),
    );
    expect(fakeDb.rows("checkoutSession")[0]?.createdAt).toBeInstanceOf(Date);
  });

  it("never throws: a missing table is noted once, other errors are logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fakeDb.missing("checkoutSession");
    expect(await addCheckout(checkout)).toBe("missing_table");
    expect(await addCheckout(checkout)).toBe("missing_table");
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
    expect(state.errors).toEqual([]);
    warn.mockRestore();

    fakeDb.reset();
    const insert = vi.spyOn(database, "insert").mockImplementationOnce(() => {
      throw new Error("connection reset");
    });
    expect(await addCheckout(checkout)).toBe("error");
    insert.mockRestore();
    expect(state.errors).toEqual([
      { action: "analytics.record_checkout", plan: "pro", interval: "year" },
    ]);
  });
});
