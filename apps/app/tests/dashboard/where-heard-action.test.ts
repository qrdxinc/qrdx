// Saving "Where did you first hear about QRdx?" (actions/where-heard.ts)
// against the in-memory database: the answer joins the account's
// user_acquisition row without touching what the sign-up recorded, an
// account with no row gets one for the answer alone, and nothing is written,
// quietly, while the table (or its new columns) doesn't exist.
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: "u_1" as string | null }));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () =>
        session.userId ? { user: { id: session.userId } } : null,
    },
  },
}));
const logged = vi.hoisted(() => ({ errors: [] as unknown[] }));
vi.mock("@/lib/shared", () => ({
  logError: (error: unknown) => logged.errors.push(error),
}));

import { saveWhereHeard } from "@/actions/where-heard";
import { fakeDb } from "../support/fake-db";

const rows = () => fakeDb.rows("userAcquisition");

beforeEach(() => {
  fakeDb.reset();
  fakeDb.unique("userAcquisition", "userId");
  session.userId = "u_1";
  logged.errors = [];
});

describe("saveWhereHeard", () => {
  it("adds the answer to the row the sign-up recorded", async () => {
    fakeDb.seed("userAcquisition", [
      { userId: "u_1", channel: "search", referrerHost: "google.com" },
    ]);
    expect(await saveWhereHeard("ai_assistant", "ignored")).toEqual({
      ok: true,
    });
    expect(rows()).toEqual([
      expect.objectContaining({
        userId: "u_1",
        channel: "search",
        referrerHost: "google.com",
        selfReported: "ai_assistant",
        selfReportedText: null,
      }),
    ]);
  });

  it("gives an account with no record a row for the answer, channel unknown", async () => {
    expect(await saveWhereHeard("other", "  a print shop ")).toEqual({
      ok: true,
    });
    expect(rows()).toEqual([
      expect.objectContaining({
        userId: "u_1",
        channel: "unknown",
        selfReported: "other",
        selfReportedText: "a print shop",
      }),
    ]);
  });

  it("replaces an earlier answer", async () => {
    await saveWhereHeard("search", null);
    await saveWhereHeard("friend", null);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]?.selfReported).toBe("friend");
  });

  it("refuses an answer it doesn't know, and a signed-out request", async () => {
    expect(await saveWhereHeard("billboard", null)).toEqual({ ok: false });
    session.userId = null;
    expect(await saveWhereHeard("search", null)).toEqual({ ok: false });
    expect(rows()).toEqual([]);
  });

  it("writes nothing, and logs nothing, while the table doesn't exist", async () => {
    fakeDb.missing("userAcquisition");
    expect(await saveWhereHeard("search", null)).toEqual({ ok: false });
    expect(logged.errors).toEqual([]);
  });
});
