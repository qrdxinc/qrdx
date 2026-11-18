// The console's change-email endpoint runs the admin page's own operation
// (app/(app)/admin/_lib/operations.ts changeAccountEmail), so the rule that
// an account is never moved onto an ADMIN_EMAILS address (where, verified,
// it would become an admin) holds for the console too. And a database error
// on the way is logged by its kind and code, never with the new address
// that Drizzle's message would list.
//
// The signature and actor checks are route.test.ts's; here they pass. The
// database is a scripted fake; nothing connects anywhere.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { root: string; table?: string; steps: [string, unknown[]][] };

const SECRET = vi.hoisted(() => {
  const secret = "e".repeat(40);
  // Read when env.ts loads.
  process.env.CONSOLE_INTERNAL_SECRET = secret;
  return secret;
});

const state = vi.hoisted(() => ({
  calls: [] as Call[],
  results: [] as unknown[],
}));

const ACTOR = {
  id: "u_admin",
  email: "admin@qrdx.test",
  name: "Admin",
  role: "admin",
  sessionId: "sess_admin",
  twoFactorEnabled: true,
};

vi.mock("@/lib/console-internal/actor", () => ({
  loadConsoleActor: vi.fn(async () => ACTOR),
  // A strong confirmation from the last 10 minutes: the refusal below
  // doesn't depend on its absence.
  requireStrongConsoleActor: vi.fn(async () => undefined),
}));
vi.mock("@repo/rate-limit", () => ({
  redis: { set: async () => "OK" },
  createRateLimiter: () => ({
    limit: async () => ({ success: true, limit: 5, remaining: 4, reset: 0 }),
  }),
  slidingWindow: () => ({}),
  RateLimitUnavailableError: class extends Error {},
}));
const audit = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async (_entry: Record<string, unknown>) => undefined),
}));
vi.mock("@/app/(app)/admin/_lib/audit", () => audit);

vi.mock("@repo/database", () => {
  const tableName = (value: unknown) =>
    typeof value === "object" && value && "__table" in value
      ? String((value as { __table: string }).__table)
      : undefined;
  const chain = (call: Call): unknown =>
    new Proxy(() => undefined, {
      get: (_target, key) => {
        if (key === "then") {
          const result = state.results.length ? state.results.shift() : [];
          return (
            resolve: (value: unknown) => void,
            reject: (error: unknown) => void,
          ) => (result instanceof Error ? reject(result) : resolve(result));
        }
        return (...args: unknown[]) => {
          call.steps.push([String(key), args]);
          if (key === "from") call.table ??= tableName(args[0]);
          return chain(call);
        };
      },
    });
  const start =
    (root: string) =>
    (...args: unknown[]) => {
      const call: Call = { root, table: tableName(args[0]), steps: [] };
      state.calls.push(call);
      return chain(call);
    };
  const table = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get: (target, key) =>
          key in target ? target[key as "__table"] : `${name}.${String(key)}`,
      },
    );
  return {
    database: {
      select: start("select"),
      update: start("update"),
      delete: start("delete"),
      batch: start("batch"),
    },
    abuseReport: table("abuse_report"),
    account: table("account"),
    integration: table("integration"),
    invitation: table("invitation"),
    member: table("member"),
    organization: table("organization"),
    session: table("session"),
    user: table("user"),
    webhookDelivery: table("webhook_delivery"),
    webhookEndpoint: table("webhook_endpoint"),
  };
});
vi.mock("drizzle-orm", () => {
  const op = (...args: unknown[]) => ({ op: true, args });
  return { and: op, count: op, eq: op, sql: op };
});

const afterEmailChanged = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/account/email-change-server", () => ({ afterEmailChanged }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (run: () => unknown) => {
    void run();
  },
}));
vi.mock("@/lib/connected-accounts/server", () => ({
  revokeStoredToken: vi.fn(),
}));
vi.mock("@/lib/data-connections/server", () => ({
  cleanupDataConnection: vi.fn(),
}));
vi.mock("@/lib/events/deliveries", () => ({
  claimDueDeliveries: vi.fn(),
  processClaimed: vi.fn(),
}));
vi.mock("@/lib/migrate/server/repo", () => ({
  JOB_STORE_PROVIDER: "qrdx-import",
}));
vi.mock("@/lib/files/admin", () => ({ setFileBlocked: vi.fn() }));
vi.mock("@repo/auth/server", () => ({ auth: {} }));

const { POST } = await import(
  "@/app/api/internal/console/users/change-email/route"
);
const {
  consoleSignature,
  REQUEST_ID_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} = await import("@/lib/console-internal/signature");
const { DrizzleQueryError } = await import("drizzle-orm/errors");

const PATH = "/api/internal/console/users/change-email";
let counter = 0;
function changeEmail(newEmail: string) {
  const body = JSON.stringify({
    actor: {
      userId: ACTOR.id,
      sessionId: ACTOR.sessionId,
      grant: "g".repeat(43),
    },
    userId: "u_target",
    newEmail,
    reason: "Lost-email policy, ticket 99",
  });
  const parts = {
    timestamp: String(Math.floor(Date.now() / 1000)),
    requestId: (counter++).toString(16).padStart(32, "0"),
    pathname: PATH,
    body,
  };
  return POST(
    new NextRequest(`https://qrdx.test${PATH}`, {
      method: "POST",
      body,
      headers: {
        [TIMESTAMP_HEADER]: parts.timestamp,
        [REQUEST_ID_HEADER]: parts.requestId,
        [SIGNATURE_HEADER]: consoleSignature(SECRET, parts),
      },
    }),
  );
}

const TARGET = {
  id: "u_target",
  email: "lost@example.com",
  emailVerified: true,
  role: "user",
};

const wrote = () =>
  state.calls.some((call) => call.root === "update" || call.root === "batch");

const logged = {
  info: vi.spyOn(console, "info"),
  warn: vi.spyOn(console, "warn"),
  error: vi.spyOn(console, "error"),
};
const lines = () =>
  Object.values(logged).flatMap((spy) =>
    spy.mock.calls.map((args) => args.map(String).join(" ")),
  );

beforeEach(() => {
  state.calls = [];
  state.results = [];
  audit.writeAuditLog.mockClear();
  afterEmailChanged.mockClear();
  for (const spy of Object.values(logged)) {
    spy.mockReset();
    spy.mockImplementation(() => undefined);
  }
});

describe("the console's change-email", () => {
  it("moves an account to an ordinary address", async () => {
    state.results = [[TARGET], [], []];
    const response = await changeEmail("New@Example.com");
    expect(response.status).toBe(200);
    expect(wrote()).toBe(true);
    expect(afterEmailChanged).toHaveBeenCalledWith(
      expect.objectContaining({ newEmail: "new@example.com" }),
    );
    expect(audit.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.change_email" }),
    );
  });

  it("never moves an account onto an ADMIN_EMAILS address", async () => {
    vi.stubEnv("ADMIN_EMAILS", "ops@example.com,boss@example.com");
    state.results = [[TARGET], [], []];
    const response = await changeEmail("Boss@Example.com");
    vi.unstubAllEnvs();
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error:
        "That address is on the admin list, so the account would become an admin. Grant the admin role instead.",
    });
    expect(wrote()).toBe(false);
    expect(afterEmailChanged).not.toHaveBeenCalled();
    expect(audit.writeAuditLog).not.toHaveBeenCalled();
    // Its log line names the refusal by code, not the address.
    expect(lines()).toEqual([
      JSON.stringify({
        event: "console_internal.outcome",
        path: PATH,
        actorId: "u_admin",
        grant: true,
        status: 400,
        code: "admin_action",
      }),
    ]);
  });

  it("logs a database error by its kind and code, never the new address", async () => {
    state.results = [
      [TARGET],
      new DrizzleQueryError(
        'select "id" from "user" where lower("email") = $1 limit $2',
        ["new.owner@example.com", 1],
        Object.assign(new Error("Connection terminated unexpectedly"), {
          name: "NeonDbError",
          code: "08006",
        }),
      ),
    ];
    const response = await changeEmail("new.owner@example.com");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Action failed",
    });
    expect(lines()).toEqual([
      JSON.stringify({
        event: "console_internal.outcome",
        path: PATH,
        actorId: "u_admin",
        grant: true,
        status: 500,
        code: "failed",
        error: { name: "DrizzleQueryError", code: "08006" },
      }),
    ]);
    const text = lines().join("\n");
    for (const leaked of ["new.owner", "@", "Failed query", "params"]) {
      expect(text).not.toContain(leaked);
    }
    expect(wrote()).toBe(false);
  });
});
