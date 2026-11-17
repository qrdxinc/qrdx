// The check /oauth/confirm runs (checkStrongConfirmationAction, the admin
// pages' own), against in-memory tables (tests/support/fake-db.ts) and the
// real confirmation records (lib/account/confirmation-server.tsx): an admin
// with two-step verification, whose session confirmed with a passkey, an
// authenticator code or a backup code in the last 10 minutes, passes; a
// confirmation 10 minutes old, a weaker one (an emailed code), another
// session's, a held session or no two-step verification don't; anyone but
// an admin is refused before anything is read. The row it writes is the one
// the console checks for the session it signed in with: identifier
// strongConfirmedIdentifier(<session id>), value the user's id.
// Nothing connects to a database.
import { strongConfirmedIdentifier } from "@repo/auth/confirm-sign-in-rules";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const ADMIN = { id: "u_admin", email: "admin@example.com", name: "A" };
const SESSION = "s_console";

const state = vi.hoisted(() => ({
  admin: null as null | { id: string; email: string; name: string },
  session: null as null | { userId: string; sessionId: string; held: boolean },
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
vi.mock("@/app/(app)/admin/_lib/guard", () => ({
  getAdminUser: vi.fn(async () => state.admin),
  requireAdmin: vi.fn(),
  assertAdmin: vi.fn(async () => {
    if (!state.admin) throw new Error("Not found");
    return state.admin;
  }),
}));
// The browser's session; everything else in the module is the real thing.
vi.mock("@/lib/account/confirmation-server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/account/confirmation-server")
  >()),
  currentSession: async () =>
    state.session
      ? {
          ...state.session,
          email: ADMIN.email,
          sessionCreatedAt: new Date(),
          requestHeaders: new Headers(),
        }
      : null,
}));

const { checkStrongConfirmationAction } = await import(
  "@/app/(app)/admin/confirm/actions"
);
const { recordConfirmation } = await import(
  "@/lib/account/confirmation-server"
);

const REQUIRED = { ok: false, error: "CONFIRMATION_REQUIRED" };

function admin({ twoFactor = true } = {}) {
  fakeDb.seed("user", [
    {
      id: ADMIN.id,
      email: ADMIN.email,
      twoFactorEnabled: twoFactor,
      updatedAt: new Date(),
    },
  ]);
  state.admin = ADMIN;
  state.session = { userId: ADMIN.id, sessionId: SESSION, held: false };
}

/** A passkey, authenticator or backup-code confirmation, as the dialog makes. */
const confirmStrongly = (sessionId = SESSION) =>
  recordConfirmation({ userId: ADMIN.id, sessionId }, { strong: "passkey" });

beforeEach(() => {
  fakeDb.resetAll();
  state.admin = null;
  state.session = null;
  vi.useFakeTimers({ now: new Date("2026-11-17T10:00:00Z") });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("/oauth/confirm's check", () => {
  it("asks, then lets a strong confirmation count for 10 minutes", async () => {
    admin();
    expect(await checkStrongConfirmationAction()).toEqual(REQUIRED);
    await confirmStrongly();
    expect(await checkStrongConfirmationAction()).toEqual({ ok: true });
    vi.setSystemTime(new Date("2026-11-17T10:09:59Z"));
    expect(await checkStrongConfirmationAction()).toEqual({ ok: true });
    vi.setSystemTime(new Date("2026-11-17T10:10:01Z"));
    expect(await checkStrongConfirmationAction()).toEqual(REQUIRED);
  });

  it("writes the row the console's database function reads", async () => {
    admin();
    await confirmStrongly();
    const row = fakeDb
      .rows("verification")
      .find((entry) => entry.identifier === strongConfirmedIdentifier(SESSION));
    expect(row?.value).toBe(ADMIN.id);
    expect(row?.expiresAt).toEqual(new Date("2026-11-17T10:10:00.000Z"));
  });

  it("doesn't count a weaker confirmation (an emailed code)", async () => {
    admin();
    await recordConfirmation({ userId: ADMIN.id, sessionId: SESSION });
    expect(await checkStrongConfirmationAction()).toEqual(REQUIRED);
  });

  it("doesn't count another session's confirmation", async () => {
    admin();
    await confirmStrongly("s_other");
    expect(await checkStrongConfirmationAction()).toEqual(REQUIRED);
  });

  it("doesn't count another person's row for the same session id", async () => {
    admin();
    fakeDb.seed("verification", [
      {
        id: "v_1",
        identifier: strongConfirmedIdentifier(SESSION),
        value: "u_someone_else",
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    expect(await checkStrongConfirmationAction()).toEqual(REQUIRED);
  });

  it("never passes a held session, even with a fresh confirmation", async () => {
    admin();
    await confirmStrongly();
    state.session = { userId: ADMIN.id, sessionId: SESSION, held: true };
    expect(await checkStrongConfirmationAction()).toEqual(REQUIRED);
  });

  it("needs the admin's own two-step verification", async () => {
    admin({ twoFactor: false });
    await confirmStrongly();
    expect(await checkStrongConfirmationAction()).toMatchObject({
      ok: false,
      error: expect.stringMatching(/two-step verification/),
    });
  });

  it("refuses anyone but an admin before reading anything", async () => {
    state.session = { userId: "u_someone", sessionId: SESSION, held: false };
    await expect(checkStrongConfirmationAction()).rejects.toThrow("Not found");
    expect(fakeDb.rows("verification")).toEqual([]);
  });
});
