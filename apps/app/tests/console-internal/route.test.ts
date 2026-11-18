// The steps every /api/internal/console/* endpoint runs
// (lib/console-internal/route.ts and actor.ts): off without a long enough
// secret, a fresh and matching signature, each request id once, the admin
// checked again against this app's database (role, verified email, no ban,
// the named qrdx.dev session alive and theirs, and the console sign-in's
// grant when the call carries one), and for strong endpoints the
// admin's own second factor and a recent strong confirmation by that session.
// Then the rate limit per admin and endpoint, failing closed (a
// CONFIRMATION_REQUIRED refusal gives its count back), an "<action>.failed"
// audit entry when the work fails unexpectedly, and one log line per signed
// request that never carries the secret, the signature, headers, the body,
// an address or a database error's message.
//
// The database is a scripted fake (a scripted Error makes that query fail);
// the limiter counts in memory. Nothing connects anywhere.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

type Call = { root: string; table?: string; steps: [string, unknown[]][] };

const state = vi.hoisted(() => ({
  env: {
    CONSOLE_INTERNAL_SECRET: undefined as string | undefined,
    NEXT_PUBLIC_APP_URL: "https://qrdx.test",
  },
  calls: [] as Call[],
  results: [] as unknown[],
  seen: new Set<string>(),
  redisDown: false,
  redisMissing: false,
  strongConfirmed: true,
  /** The rate limit store can't answer (the replay store still can). */
  limiterDown: false,
  /** The store takes counts but can't give one back. */
  refundDown: false,
  /** Calls counted so far, by limiter prefix and key. */
  counts: new Map<string, number>(),
  /** Every limiter created: its prefix, window and failClosed. */
  limiters: [] as {
    prefix?: string;
    tokens: number;
    window: string;
    failClosed?: boolean;
  }[],
}));

vi.mock("@/env", () => ({ env: state.env }));

const replayStore = vi.hoisted(() => ({
  set: async (key: string) => {
    if (state.redisDown) throw new Error("redis down");
    if (state.seen.has(key)) return null;
    state.seen.add(key);
    return "OK";
  },
}));
const limits = vi.hoisted(() => {
  class RateLimitUnavailableError extends Error {}
  return {
    RateLimitUnavailableError,
    // A fixed window that never ends: every call in a test is "in the
    // same minute" (or hour).
    createRateLimiter: ({
      limiter,
      prefix,
      failClosed,
    }: {
      limiter: { tokens: number; window: string };
      prefix?: string;
      failClosed?: boolean;
    }) => {
      state.limiters.push({ ...limiter, prefix, failClosed });
      return {
        // A negative rate gives counts back, as Upstash's refund does.
        limit: async (key: string, rate = 1) => {
          if (state.limiterDown || (rate < 0 && state.refundDown)) {
            throw new RateLimitUnavailableError("Upstash failed");
          }
          const id = `${prefix}|${key}`;
          const used = (state.counts.get(id) ?? 0) + rate;
          state.counts.set(id, used);
          return {
            success: used <= limiter.tokens,
            limit: limiter.tokens,
            remaining: Math.max(0, limiter.tokens - used),
            reset: Date.now() + 42_000,
            pending: Promise.resolve(),
          };
        },
      };
    },
    slidingWindow: (tokens: number, window: string) => ({ tokens, window }),
  };
});
vi.mock("@repo/rate-limit", () => ({
  // Read on every request, so a test can take Upstash away.
  get redis() {
    return state.redisMissing ? null : replayStore;
  },
  ...limits,
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
  const start = (root: string) => () => {
    const call: Call = { root, steps: [] };
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
    database: { select: start("select") },
    user: table("user"),
    session: table("session"),
    adminConsoleGrant: table("admin_console_grant"),
    oauthApp: table("oauth_app"),
    oauthToken: table("oauth_token"),
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ op: "and", args }),
  eq: (left: unknown, right: unknown) => ({ op: "eq", left, right }),
  gt: (left: unknown, right: unknown) => ({ op: "gt", left, right }),
  lte: (left: unknown, right: unknown) => ({ op: "lte", left, right }),
  isNull: (value: unknown) => ({ op: "isNull", value }),
}));

const strongCheck = vi.hoisted(() => vi.fn());
vi.mock("@/lib/account/confirmation-server", () => ({
  hasRecentStrongConfirmation: strongCheck,
}));

const { consoleInternalRoute } = await import("@/lib/console-internal/route");
const {
  consoleSignature,
  REQUEST_ID_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} = await import("@/lib/console-internal/signature");
const { HttpError } = await import("@/lib/http-error");
const { grantHash } = await import("@/lib/admin-console/grants");
// Drizzle's real query error (only "drizzle-orm" itself is faked above).
const { DrizzleQueryError } = await import("drizzle-orm/errors");

const SECRET = "k".repeat(48);
const PATH = "/api/internal/console/test";
const ACTOR = { userId: "u_admin", sessionId: "sess_admin" };

const adminRow = (overrides: Record<string, unknown> = {}) => ({
  id: "u_admin",
  email: "admin@qrdx.test",
  name: "Admin",
  role: "admin",
  emailVerified: true,
  banned: false,
  banExpires: null,
  twoFactorEnabled: true,
  ...overrides,
});

let counter = 0;
function signedRequest(
  body: unknown,
  {
    secret = SECRET,
    path = PATH,
    timestamp = Math.floor(Date.now() / 1000),
    requestId,
    raw,
  }: {
    secret?: string;
    path?: string;
    timestamp?: number;
    requestId?: string;
    raw?: string;
  } = {},
) {
  const text = raw ?? JSON.stringify(body);
  const id = requestId ?? (counter++).toString(16).padStart(32, "0");
  const parts = {
    timestamp: String(timestamp),
    requestId: id,
    pathname: path,
    body: text,
  };
  return new NextRequest(`https://qrdx.test${path}`, {
    method: "POST",
    body: text,
    headers: {
      "content-type": "application/json",
      [TIMESTAMP_HEADER]: parts.timestamp,
      [REQUEST_ID_HEADER]: id,
      [SIGNATURE_HEADER]: consoleSignature(secret, parts),
    },
  });
}

const run = vi.fn();
const POST = consoleInternalRoute({
  action: "test.run",
  schema: z.object({
    n: z.number().int({ error: "n must be a whole number" }),
  }),
  strong: (input) => input.n > 1,
  run,
});

/** Scripts the actor check: the user row, then whether the session is alive. */
const actorRows = (row: unknown, sessionAlive = true) => {
  state.results.push(
    row ? [row] : [],
    sessionAlive ? [{ id: "sess_admin" }] : [],
  );
};

const answer = async (response: Response) => ({
  status: response.status,
  body: (await response.json()) as Record<string, unknown>,
  cache: response.headers.get("cache-control"),
});

/** The log lines written so far, by level. */
const logged = {
  info: vi.spyOn(console, "info"),
  warn: vi.spyOn(console, "warn"),
  error: vi.spyOn(console, "error"),
  log: vi.spyOn(console, "log"),
};
const allLines = () =>
  Object.values(logged).flatMap((spy) =>
    spy.mock.calls.map((args) => args.map(String).join(" ")),
  );

beforeEach(() => {
  for (const spy of Object.values(logged)) {
    spy.mockReset();
    spy.mockImplementation(() => undefined);
  }
  state.env.CONSOLE_INTERNAL_SECRET = SECRET;
  state.calls = [];
  state.results = [];
  state.seen.clear();
  state.redisDown = false;
  state.redisMissing = false;
  state.limiterDown = false;
  state.refundDown = false;
  state.counts.clear();
  audit.writeAuditLog.mockReset();
  audit.writeAuditLog.mockResolvedValue(undefined);
  run.mockReset();
  run.mockResolvedValue({
    audit: { targetType: "user", targetId: "u_1", metadata: { a: 1 } },
    data: { done: true },
  });
  strongCheck.mockReset();
  strongCheck.mockImplementation(async () => state.strongConfirmed);
  state.strongConfirmed = true;
});

describe("off without the secret", () => {
  it.each([
    ["unset", undefined],
    ["shorter than 32 characters", "k".repeat(31)],
  ])("answers 404 when it's %s", async (_label, secret) => {
    state.env.CONSOLE_INTERNAL_SECRET = secret;
    const { status, cache } = await answer(
      await POST(
        signedRequest({ actor: ACTOR, n: 1 }, { secret: "k".repeat(31) }),
      ),
    );
    expect(status).toBe(404);
    expect(cache).toBe("no-store");
    expect(state.calls).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("the signature", () => {
  it("refuses another secret, another path, a stale time and missing headers", async () => {
    const requests = [
      signedRequest({ actor: ACTOR, n: 1 }, { secret: "x".repeat(48) }),
      // Signed for one endpoint, sent to another.
      (() => {
        const request = signedRequest(
          { actor: ACTOR, n: 1 },
          { path: "/api/internal/console/other" },
        );
        return new NextRequest(`https://qrdx.test${PATH}`, {
          method: "POST",
          body: JSON.stringify({ actor: ACTOR, n: 1 }),
          headers: request.headers,
        });
      })(),
      signedRequest(
        { actor: ACTOR, n: 1 },
        { timestamp: Math.floor(Date.now() / 1000) - 301 },
      ),
      new NextRequest(`https://qrdx.test${PATH}`, {
        method: "POST",
        body: JSON.stringify({ actor: ACTOR, n: 1 }),
      }),
    ];
    for (const request of requests) {
      const { status, body } = await answer(await POST(request));
      expect(status).toBe(401);
      expect(body).toEqual({ ok: false, error: "unauthorized" });
    }
    expect(state.calls).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses a body changed after signing", async () => {
    const request = signedRequest({ actor: ACTOR, n: 1 });
    const tampered = new NextRequest(`https://qrdx.test${PATH}`, {
      method: "POST",
      body: JSON.stringify({ actor: { ...ACTOR, userId: "u_other" }, n: 1 }),
      headers: request.headers,
    });
    expect((await POST(tampered)).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("takes each request id once", async () => {
    const requestId = "ab".repeat(16);
    actorRows(adminRow());
    const first = await POST(
      signedRequest({ actor: ACTOR, n: 1 }, { requestId }),
    );
    expect(first.status).toBe(200);
    const again = await answer(
      await POST(signedRequest({ actor: ACTOR, n: 1 }, { requestId })),
    );
    expect(again).toMatchObject({
      status: 409,
      body: { ok: false, error: "replayed" },
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("refuses when the replay store can't answer", async () => {
    state.redisDown = true;
    expect((await POST(signedRequest({ actor: ACTOR, n: 1 }))).status).toBe(
      503,
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("answers 503 without Upstash, before any check of the actor", async () => {
    state.redisMissing = true;
    const { status, body } = await answer(
      await POST(signedRequest({ actor: ACTOR, n: 1 })),
    );
    expect(status).toBe(503);
    expect(body).toEqual({ ok: false, error: "unavailable" });
    expect(state.calls).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it("reads a chunked body as a stream and stops past 64 KiB", async () => {
    const chunk = new TextEncoder().encode("x".repeat(16 * 1024));
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
      },
    });
    const request = new NextRequest(`https://qrdx.test${PATH}`, {
      method: "POST",
      body: endless,
      // Node's fetch needs this for a stream body.
      duplex: "half",
    });
    expect(request.headers.get("content-length")).toBeNull();
    const { status } = await answer(await POST(request));
    expect(status).toBe(413);
    // It stopped reading soon after the limit, not at the end of the stream.
    expect(pulled).toBeLessThan(10);
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses a body over 64 KiB", async () => {
    const big = { actor: ACTOR, n: 1, pad: "x".repeat(70_000) };
    expect((await POST(signedRequest(big))).status).toBe(413);
  });

  it("refuses a signed body that isn't JSON, or has no actor", async () => {
    expect((await POST(signedRequest(null, { raw: "{not json" }))).status).toBe(
      400,
    );
    expect((await POST(signedRequest({ n: 1 }))).status).toBe(400);
    expect(state.calls).toEqual([]);
  });
});

describe("the actor", () => {
  it.each([
    ["isn't an admin", adminRow({ role: "user" }), true],
    ["is banned", adminRow({ banned: true }), true],
    [
      "is banned until later",
      adminRow({ banned: true, banExpires: new Date(Date.now() + 60_000) }),
      true,
    ],
    ["has an unverified email", adminRow({ emailVerified: false }), true],
    ["doesn't exist", null, true],
    ["signed out of that session (or it isn't theirs)", adminRow(), false],
  ])("is refused when the user %s", async (_label, row, alive) => {
    actorRows(row, alive);
    const { status, body } = await answer(
      await POST(signedRequest({ actor: ACTOR, n: 1 })),
    );
    expect(status).toBe(403);
    expect(body).toEqual({ ok: false, error: "not_admin" });
    expect(run).not.toHaveBeenCalled();
  });

  it("checks the session by its id, its user and its expiry", async () => {
    actorRows(adminRow());
    await POST(signedRequest({ actor: ACTOR, n: 1 }));
    const sessionQuery = state.calls.find((call) => call.table === "session");
    const where = sessionQuery?.steps.find(
      ([step]) => step === "where",
    )?.[1][0];
    expect(where).toEqual({
      op: "and",
      args: [
        { op: "eq", left: "session.id", right: "sess_admin" },
        { op: "eq", left: "session.userId", right: "u_admin" },
        { op: "gt", left: "session.expiresAt", right: expect.any(Date) },
      ],
    });
  });

  it("lets an expired ban through", async () => {
    actorRows(
      adminRow({ banned: true, banExpires: new Date(Date.now() - 1000) }),
    );
    expect((await POST(signedRequest({ actor: ACTOR, n: 1 }))).status).toBe(
      200,
    );
  });

  it("hands the endpoint the admin it checked", async () => {
    actorRows(adminRow());
    await POST(signedRequest({ actor: ACTOR, n: 1 }));
    expect(run).toHaveBeenCalledWith(
      { n: 1 },
      expect.objectContaining({
        actor: {
          id: "u_admin",
          email: "admin@qrdx.test",
          name: "Admin",
          role: "admin",
          sessionId: "sess_admin",
          twoFactorEnabled: true,
        },
      }),
    );
  });
});

describe("the console sign-in's grant", () => {
  const GRANT = "g".repeat(43);
  const WITH_GRANT = { ...ACTOR, grant: GRANT };
  /**
   * Scripts the actor check with a grant: the grant's row (its lookup starts
   * first, as the check begins), then the user row and the session.
   */
  const checks = (
    row: unknown,
    grant: Record<string, unknown> | Error | null,
  ) => {
    state.results.push(grant instanceof Error ? grant : grant ? [grant] : []);
    actorRows(row);
  };
  const minted = (overrides: Record<string, unknown> = {}) => ({
    userId: "u_admin",
    sessionId: "sess_admin",
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  });

  it("lets a call through with the grant minted for this admin and session, looked up by its hash", async () => {
    checks(adminRow(), minted());
    expect(
      (await POST(signedRequest({ actor: WITH_GRANT, n: 1 }))).status,
    ).toBe(200);
    expect(run).toHaveBeenCalledTimes(1);
    const lookup = state.calls.find(
      (call) => call.table === "admin_console_grant",
    );
    expect(lookup?.steps.find(([step]) => step === "where")?.[1][0]).toEqual({
      op: "eq",
      left: "admin_console_grant.tokenHash",
      right: grantHash(GRANT),
    });
    expect(JSON.stringify(state.calls)).not.toContain(GRANT);
  });

  it.each([
    ["another admin's", minted({ userId: "u_other" })],
    ["another session's", minted({ sessionId: "sess_other" })],
    ["an expired", minted({ expiresAt: new Date(Date.now() - 1000) })],
    ["an unknown", null],
  ])(
    "refuses %s grant with 403 grant_invalid, before the limit or the work",
    async (_label, row) => {
      checks(adminRow(), row);
      const { status, body } = await answer(
        await POST(signedRequest({ actor: WITH_GRANT, n: 1 })),
      );
      expect(status).toBe(403);
      expect(body).toEqual({ ok: false, error: "grant_invalid" });
      expect(state.counts.size).toBe(0);
      expect(run).not.toHaveBeenCalled();
    },
  );

  it("refuses any grant before its table exists: none was minted", async () => {
    checks(
      adminRow(),
      Object.assign(
        new Error('relation "admin_console_grant" does not exist'),
        {
          code: "42P01",
        },
      ),
    );
    expect(
      (await answer(await POST(signedRequest({ actor: WITH_GRANT, n: 1 }))))
        .body,
    ).toEqual({ ok: false, error: "grant_invalid" });
    expect(run).not.toHaveBeenCalled();
  });

  it("answers not_admin, not grant_invalid, for someone who isn't an admin", async () => {
    checks(adminRow({ role: "user" }), null);
    expect(
      (await answer(await POST(signedRequest({ actor: WITH_GRANT, n: 1 }))))
        .body,
    ).toEqual({ ok: false, error: "not_admin" });
  });

  it("still lets a call without a grant through, and doesn't look one up", async () => {
    actorRows(adminRow());
    expect((await POST(signedRequest({ actor: ACTOR, n: 1 }))).status).toBe(
      200,
    );
    expect(
      state.calls.some((call) => call.table === "admin_console_grant"),
    ).toBe(false);
  });

  it("refuses a grant that can't be one as a bad request", async () => {
    expect(
      (await POST(signedRequest({ actor: { ...ACTOR, grant: "short" }, n: 1 })))
        .status,
    ).toBe(400);
    expect(state.calls).toEqual([]);
  });
});

describe("strong endpoints", () => {
  it("need the admin's own two-step verification", async () => {
    actorRows(adminRow({ twoFactorEnabled: false }));
    const { status, body } = await answer(
      await POST(signedRequest({ actor: ACTOR, n: 2 })),
    );
    expect(status).toBe(400);
    expect(body.error).toBe(
      "Turn on two-step verification for your own account first.",
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("need a recent strong confirmation by that session", async () => {
    state.strongConfirmed = false;
    actorRows(adminRow());
    const { status, body } = await answer(
      await POST(signedRequest({ actor: ACTOR, n: 2 })),
    );
    expect(status).toBe(403);
    expect(body).toEqual({ ok: false, error: "CONFIRMATION_REQUIRED" });
    expect(strongCheck).toHaveBeenCalledWith({
      userId: "u_admin",
      sessionId: "sess_admin",
      held: false,
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("run once confirmed; others never ask", async () => {
    actorRows(adminRow());
    expect((await POST(signedRequest({ actor: ACTOR, n: 2 }))).status).toBe(
      200,
    );
    strongCheck.mockClear();
    actorRows(adminRow({ twoFactorEnabled: false }));
    expect((await POST(signedRequest({ actor: ACTOR, n: 1 }))).status).toBe(
      200,
    );
    expect(strongCheck).not.toHaveBeenCalled();
  });
});

describe("answers and the audit log", () => {
  const CHECKED = {
    id: "u_admin",
    email: "admin@qrdx.test",
    name: "Admin",
    role: "admin",
    sessionId: "sess_admin",
    twoFactorEnabled: true,
  };

  it("write the audit entry here, with the checked admin, and send the data", async () => {
    actorRows(adminRow());
    const { status, body, cache } = await answer(
      await POST(signedRequest({ actor: ACTOR, n: 1 })),
    );
    expect(status).toBe(200);
    expect(cache).toBe("no-store");
    expect(body).toEqual({ ok: true, data: { done: true } });
    expect(audit.writeAuditLog).toHaveBeenCalledWith({
      actor: CHECKED,
      action: "test.run",
      targetType: "user",
      targetId: "u_1",
      metadata: { a: 1, reason: null, via: "console" },
    });
  });

  it("record the reason from the signed body, and the subject", async () => {
    const withReason = consoleInternalRoute({
      action: "test.reason",
      schema: z.object({ reason: z.string() }),
      run: async () => ({
        audit: {
          targetType: "user",
          targetId: "u_1",
          subjectUserId: "u_1",
          metadata: { targetEmail: "t@example.com" },
        },
      }),
    });
    actorRows(adminRow());
    await withReason(signedRequest({ actor: ACTOR, reason: "Ticket 9" }));
    expect(audit.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "test.reason",
        metadata: {
          targetEmail: "t@example.com",
          reason: "Ticket 9",
          subjectUserId: "u_1",
          via: "console",
        },
      }),
    );
  });

  it("still record an effect the console stopped waiting for", async () => {
    // The console gives up (its timeout aborts the request) while the work
    // is still running; the work finishes, and its entry is written anyway.
    const controller = new AbortController();
    run.mockImplementation(async () => {
      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { audit: { targetType: "user", targetId: "u_slow" } };
    });
    actorRows(adminRow());
    const signed = signedRequest({ actor: ACTOR, n: 1 });
    const request = new NextRequest(signed, { signal: controller.signal });
    await POST(request);
    expect(controller.signal.aborted).toBe(true);
    expect(audit.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "test.run", targetId: "u_slow" }),
    );
  });

  it("write nothing when nothing changed, or the work refused", async () => {
    run.mockResolvedValue(null);
    actorRows(adminRow());
    expect(
      (await answer(await POST(signedRequest({ actor: ACTOR, n: 1 })))).body,
    ).toEqual({ ok: true });
    run.mockRejectedValue(new HttpError(400, "ADMIN_ACTION", "No"));
    actorRows(adminRow());
    expect(
      (await answer(await POST(signedRequest({ actor: ACTOR, n: 1 })))).status,
    ).toBe(400);
    expect(audit.writeAuditLog).not.toHaveBeenCalled();
  });

  it("refuse an audit record without an action name, rather than log it unnamed", async () => {
    const unnamed = consoleInternalRoute({
      schema: z.object({}),
      run: async () => ({ audit: { targetType: "user", targetId: "u_1" } }),
    });
    actorRows(adminRow());
    const { status } = await answer(
      await unnamed(signedRequest({ actor: ACTOR })),
    );
    expect(status).toBe(500);
    expect(audit.writeAuditLog).not.toHaveBeenCalled();
  });

  it("record a failed attempt when the work fails unexpectedly", async () => {
    // Part of it may stand (a ban saved, then the sign-out failed).
    run.mockRejectedValue(new Error("connection refused at 10.0.0.1"));
    actorRows(adminRow());
    expect((await POST(signedRequest({ actor: ACTOR, n: 1 }))).status).toBe(
      500,
    );
    expect(audit.writeAuditLog.mock.calls).toEqual([
      [
        {
          actor: CHECKED,
          action: "test.run.failed",
          targetType: "test",
          targetId: null,
          metadata: {
            ids: {},
            reason: null,
            error: { name: "Error" },
            via: "console",
          },
        },
      ],
    ]);
    expect(JSON.stringify(audit.writeAuditLog.mock.calls)).not.toContain(
      "10.0.0.1",
    );
  });

  it("put a failed attempt on the user the input names, with its ids and reason only", async () => {
    const onUser = consoleInternalRoute({
      action: "user.move",
      schema: z.object({
        userId: z.string(),
        accountId: z.string(),
        newEmail: z.string(),
        reason: z.string(),
      }),
      run: async () => {
        throw new DrizzleQueryError(
          'update "user" set "email" = $1',
          ["new.owner@example.com"],
          Object.assign(new Error("Key (email)=(new.owner@example.com)"), {
            code: "23505",
          }),
        );
      },
    });
    actorRows(adminRow());
    await onUser(
      signedRequest({
        actor: ACTOR,
        userId: "u_target",
        accountId: "acct_1",
        newEmail: "new.owner@example.com",
        reason: "Ticket 9",
      }),
    );
    expect(audit.writeAuditLog).toHaveBeenCalledTimes(1);
    expect(audit.writeAuditLog).toHaveBeenCalledWith({
      actor: CHECKED,
      action: "user.move.failed",
      targetType: "user",
      targetId: "u_target",
      metadata: {
        ids: { userId: "u_target", accountId: "acct_1" },
        reason: "Ticket 9",
        error: { name: "DrizzleQueryError", code: "23505" },
        subjectUserId: "u_target",
        via: "console",
      },
    });
    expect(JSON.stringify(audit.writeAuditLog.mock.calls)).not.toContain(
      "new.owner",
    );
  });

  it("record a failed attempt when the entry itself can't be written", async () => {
    audit.writeAuditLog.mockRejectedValueOnce(new Error("insert failed"));
    actorRows(adminRow());
    expect((await POST(signedRequest({ actor: ACTOR, n: 1 }))).status).toBe(
      500,
    );
    expect(
      audit.writeAuditLog.mock.calls.map(([entry]) => entry.action),
    ).toEqual(["test.run", "test.run.failed"]);
  });

  it("log one line when even the failed attempt can't be recorded", async () => {
    audit.writeAuditLog.mockRejectedValue(
      Object.assign(new Error("database is down"), { code: "57P01" }),
    );
    run.mockRejectedValue(new Error("boom"));
    actorRows(adminRow());
    expect((await POST(signedRequest({ actor: ACTOR, n: 1 }))).status).toBe(
      500,
    );
    const lines = logged.error.mock.calls.map(([line]) =>
      JSON.parse(String(line)),
    );
    expect(lines).toContainEqual({
      event: "admin.audit_failed",
      action: "test.run.failed",
      error: { name: "Error", code: "57P01" },
    });
    expect(allLines().join("\n")).not.toContain("database is down");
  });

  it("record no failed attempt for a refusal, a strong check or work that never started", async () => {
    // A refusal the admin reads (thrown before any effect).
    run.mockRejectedValue(new HttpError(400, "ADMIN_ACTION", "No"));
    actorRows(adminRow());
    await POST(signedRequest({ actor: ACTOR, n: 1 }));
    // The strong check refused: the work never ran.
    state.strongConfirmed = false;
    actorRows(adminRow());
    await POST(signedRequest({ actor: ACTOR, n: 2 }));
    // The admin check failed before the work.
    state.results.push(new Error("db down"), []);
    await POST(signedRequest({ actor: ACTOR, n: 1 }));
    expect(audit.writeAuditLog).not.toHaveBeenCalled();
  });

  it("send the input's first problem", async () => {
    actorRows(adminRow());
    const { status, body } = await answer(
      await POST(signedRequest({ actor: ACTOR, n: 1.5 })),
    );
    expect(status).toBe(400);
    expect(body).toEqual({ ok: false, error: "n must be a whole number" });
  });

  it("pass an admin-readable error through with its status", async () => {
    run.mockRejectedValue(new HttpError(404, "ADMIN_ACTION", "User not found"));
    actorRows(adminRow());
    expect(
      await answer(await POST(signedRequest({ actor: ACTOR, n: 1 }))),
    ).toMatchObject({
      status: 404,
      body: { ok: false, error: "User not found" },
    });
  });

  it("hide anything else, in the answer and in the log", async () => {
    run.mockRejectedValue(new Error("connection refused at 10.0.0.1"));
    actorRows(adminRow());
    expect(
      await answer(await POST(signedRequest({ actor: ACTOR, n: 1 }))),
    ).toMatchObject({
      status: 500,
      body: { ok: false, error: "Action failed" },
    });
    expect(allLines().join("\n")).not.toContain("10.0.0.1");
  });

  it("pass a streamed response through, uncached", async () => {
    run.mockResolvedValue(
      new Response("zip", { headers: { "Content-Type": "application/zip" } }),
    );
    actorRows(adminRow());
    const response = await POST(signedRequest({ actor: ACTOR, n: 1 }));
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("zip");
  });
});

describe("rate limits", () => {
  const sensitive = vi.fn(async () => ({
    audit: { targetType: "user", targetId: "u_1" },
  }));
  const SENSITIVE = consoleInternalRoute({
    action: "test.sensitive",
    schema: z.object({}),
    limit: "sensitive",
    run: sensitive,
  });
  const ADMIN_2 = { userId: "u_admin_2", sessionId: "sess_admin_2" };

  /** One signed call by `actor`, with the actor check scripted to pass. */
  const by = async (
    route: (request: NextRequest) => Promise<Response>,
    actor: { userId: string; sessionId: string } = ACTOR,
    fields: Record<string, unknown> = { n: 1 },
  ) => {
    actorRows(adminRow({ id: actor.userId }));
    return route(signedRequest({ actor, ...fields }));
  };

  it("use the admin pages' tiers, failing closed, under their own keys", () => {
    const admin = state.limiters.filter(({ prefix }) =>
      prefix?.startsWith("qrdx:admin"),
    );
    // The same numbers as the admin pages' runner…
    expect(admin).toEqual([
      {
        tokens: 30,
        window: "60 s",
        prefix: "qrdx:admin",
        failClosed: undefined,
      },
      {
        tokens: 5,
        window: "1 h",
        prefix: "qrdx:admin-sensitive",
        failClosed: undefined,
      },
    ]);
    // …under other keys (the console's runner counts under the admin
    // pages' keys before it calls), and never judged in memory.
    expect(
      state.limiters.filter(({ prefix }) =>
        prefix?.startsWith("qrdx:console-internal"),
      ),
    ).toEqual([
      {
        tokens: 30,
        window: "60 s",
        prefix: "qrdx:console-internal",
        failClosed: true,
      },
      {
        tokens: 5,
        window: "1 h",
        prefix: "qrdx:console-internal-sensitive",
        failClosed: true,
      },
    ]);
  });

  it("refuse the 31st call in a minute with 429 rate_limited, before the work", async () => {
    for (let i = 0; i < 30; i++) {
      expect((await by(POST)).status).toBe(200);
    }
    const limited = await by(POST);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("42");
    expect(limited.headers.get("cache-control")).toBe("no-store");
    expect(await limited.json()).toEqual({
      ok: false,
      error: "rate_limited",
      retryAfter: 42,
    });
    expect(run).toHaveBeenCalledTimes(30);
    expect(audit.writeAuditLog).toHaveBeenCalledTimes(30);
    expect(state.counts.get("qrdx:console-internal|test.run:u_admin")).toBe(31);
  });

  it("refuse the 6th sensitive call in an hour", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await by(SENSITIVE, ACTOR, {})).status).toBe(200);
    }
    const limited = await by(SENSITIVE, ACTOR, {});
    expect(limited.status).toBe(429);
    expect((await limited.json()).error).toBe("rate_limited");
    expect(sensitive).toHaveBeenCalledTimes(5);
    expect(
      state.counts.get(
        "qrdx:console-internal-sensitive|test.sensitive:u_admin",
      ),
    ).toBe(6);
  });

  it("count per admin and per endpoint", async () => {
    for (let i = 0; i < 30; i++) await by(POST);
    expect((await by(POST)).status).toBe(429);
    // Another admin, same endpoint: their own budget.
    expect((await by(POST, ADMIN_2)).status).toBe(200);
    // Same admin, another endpoint: its own budget.
    expect((await by(SENSITIVE, ACTOR, {})).status).toBe(200);
    // Endpoints without an audit action are counted by their path.
    const read = consoleInternalRoute({
      schema: z.object({}),
      run: async () => ({ data: { read: true } }),
    });
    expect((await by(read, ACTOR, {})).status).toBe(200);
    expect(state.counts.get(`qrdx:console-internal|${PATH}:u_admin`)).toBe(1);
  });

  it("come after the actor check: a refused actor uses no budget", async () => {
    actorRows(adminRow({ role: "user" }));
    expect((await POST(signedRequest({ actor: ACTOR, n: 1 }))).status).toBe(
      403,
    );
    expect(state.counts.size).toBe(0);
  });

  it("come before the strong check and the input check", async () => {
    for (let i = 0; i < 30; i++) await by(POST);
    strongCheck.mockClear();
    // n: 2 needs the strong check; n: 1.5 is invalid. Neither is reached.
    expect((await by(POST, ACTOR, { n: 2 })).status).toBe(429);
    expect((await by(POST, ACTOR, { n: 1.5 })).status).toBe(429);
    expect(strongCheck).not.toHaveBeenCalled();
  });

  it("give a CONFIRMATION_REQUIRED refusal's count back: nothing ran", async () => {
    state.strongConfirmed = false;
    // n: 2 needs the strong check here, before the work.
    expect((await by(POST, ACTOR, { n: 2 })).status).toBe(403);
    expect(state.counts.get("qrdx:console-internal|test.run:u_admin")).toBe(0);
    // A strong check inside the work (an operation's requireStrong) too.
    const inner = vi.fn(async () => {
      throw new HttpError(
        403,
        "CONFIRMATION_REQUIRED",
        "CONFIRMATION_REQUIRED",
      );
    });
    const SENSITIVE_INNER = consoleInternalRoute({
      action: "test.sensitive_inner",
      schema: z.object({}),
      limit: "sensitive",
      run: inner,
    });
    for (let i = 0; i < 10; i++) {
      expect((await by(SENSITIVE_INNER, ACTOR, {})).status).toBe(403);
    }
    expect(
      state.counts.get(
        "qrdx:console-internal-sensitive|test.sensitive_inner:u_admin",
      ),
    ).toBe(0);
    // The five an hour are all still there once confirmed.
    inner.mockResolvedValue(undefined as never);
    for (let i = 0; i < 5; i++) {
      expect((await by(SENSITIVE_INNER, ACTOR, {})).status).toBe(200);
    }
    expect((await by(SENSITIVE_INNER, ACTOR, {})).status).toBe(429);
  });

  it("keep counting every other refusal", async () => {
    run.mockRejectedValue(new HttpError(400, "ADMIN_ACTION", "No"));
    expect((await by(POST)).status).toBe(400);
    run.mockRejectedValue(new Error("boom"));
    expect((await by(POST)).status).toBe(500);
    // No two-step verification on the admin's own account: not a round trip.
    actorRows(adminRow({ twoFactorEnabled: false }));
    expect((await POST(signedRequest({ actor: ACTOR, n: 2 }))).status).toBe(
      400,
    );
    expect(state.counts.get("qrdx:console-internal|test.run:u_admin")).toBe(3);
  });

  it("still answer CONFIRMATION_REQUIRED when the count can't be given back", async () => {
    state.strongConfirmed = false;
    state.refundDown = true;
    const response = await by(POST, ACTOR, { n: 2 });
    expect(await response.json()).toEqual({
      ok: false,
      error: "CONFIRMATION_REQUIRED",
    });
    expect(state.counts.get("qrdx:console-internal|test.run:u_admin")).toBe(1);
    expect(
      logged.warn.mock.calls.map(([line]) => JSON.parse(String(line)).event),
    ).toContain("rate_limit.refund_failed");
  });

  it("answer 503 when the limit store can't answer, and do nothing", async () => {
    state.limiterDown = true;
    const response = await by(POST);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: "unavailable",
    });
    expect(run).not.toHaveBeenCalled();
    expect(strongCheck).not.toHaveBeenCalled();
    expect(audit.writeAuditLog).not.toHaveBeenCalled();
  });
});

describe("the log line", () => {
  /** The single outcome line, parsed; fails unless there's exactly one. */
  const onlyLine = () => {
    const lines = allLines();
    expect(lines).toHaveLength(1);
    return JSON.parse(lines[0] ?? "") as Record<string, unknown>;
  };

  /** Nothing the request carried beyond the path and the admin's id. */
  const expectNoSecrets = (request: NextRequest) => {
    const text = allLines().join("\n");
    for (const secret of [
      SECRET,
      request.headers.get(SIGNATURE_HEADER) ?? "",
      request.headers.get(SIGNATURE_HEADER)?.slice(3) ?? "",
      request.headers.get(REQUEST_ID_HEADER) ?? "",
      "sess_admin",
      "admin@qrdx.test",
      "@",
      "Ticket",
    ]) {
      expect(text).not.toContain(secret);
    }
  };

  it("is one line for a CONFIRMATION_REQUIRED refusal: path, admin, status, code", async () => {
    state.strongConfirmed = false;
    actorRows(adminRow());
    const request = signedRequest({ actor: ACTOR, n: 2, reason: "Ticket 9" });
    expect((await POST(request)).status).toBe(403);
    expect(onlyLine()).toEqual({
      event: "console_internal.outcome",
      path: PATH,
      actorId: "u_admin",
      grant: false,
      status: 403,
      code: "confirmation_required",
    });
    expect(logged.warn).toHaveBeenCalledTimes(1);
    expectNoSecrets(request);
  });

  it("is one line for an operation's refusal, without its message", async () => {
    run.mockRejectedValue(
      new HttpError(400, "ADMIN_ACTION", "Remove their admin role first."),
    );
    actorRows(adminRow());
    const request = signedRequest({ actor: ACTOR, n: 1 });
    const response = await POST(request);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Remove their admin role first.",
    });
    expect(onlyLine()).toEqual({
      event: "console_internal.outcome",
      path: PATH,
      actorId: "u_admin",
      grant: false,
      status: 400,
      code: "admin_action",
    });
    expectNoSecrets(request);
  });

  it.each([
    [
      "the actor isn't an admin",
      () => actorRows(adminRow({ role: "user" })),
      1,
      403,
      "not_admin",
    ],
    [
      "the admin is over the limit",
      () => {
        state.counts.set("qrdx:console-internal|test.run:u_admin", 30);
        actorRows(adminRow());
      },
      1,
      429,
      "rate_limited",
    ],
    [
      "the input is invalid",
      () => actorRows(adminRow()),
      1.5,
      400,
      "invalid_input",
    ],
    [
      "the admin has no two-step verification of their own",
      () => actorRows(adminRow({ twoFactorEnabled: false })),
      2,
      400,
      "two_factor_required",
    ],
  ])("is one line when %s", async (_label, setUp, n, status, code) => {
    setUp();
    const request = signedRequest({ actor: ACTOR, n });
    expect((await POST(request)).status).toBe(status);
    expect(onlyLine()).toEqual({
      event: "console_internal.outcome",
      path: PATH,
      actorId: "u_admin",
      grant: false,
      status,
      code,
    });
    expectNoSecrets(request);
  });

  it("is one line for a replay and for a store that can't answer, before any admin is read", async () => {
    const requestId = "cd".repeat(16);
    actorRows(adminRow());
    await POST(signedRequest({ actor: ACTOR, n: 1 }, { requestId }));
    for (const spy of Object.values(logged)) spy.mockClear();
    await POST(signedRequest({ actor: ACTOR, n: 1 }, { requestId }));
    expect(onlyLine()).toEqual({
      event: "console_internal.outcome",
      path: PATH,
      actorId: null,
      status: 409,
      code: "replayed",
    });
    for (const spy of Object.values(logged)) spy.mockClear();
    state.limiterDown = true;
    actorRows(adminRow());
    await POST(signedRequest({ actor: ACTOR, n: 1 }));
    expect(onlyLine()).toEqual({
      event: "console_internal.outcome",
      path: PATH,
      actorId: "u_admin",
      grant: false,
      status: 503,
      code: "unavailable",
      reason: "rate_limit_store",
    });
  });

  it("says whether the call carried a grant, never the grant itself", async () => {
    const grant = "g".repeat(43);
    // The grant's lookup starts first, then the user row and the session.
    state.results.push([
      {
        userId: "u_admin",
        sessionId: "sess_admin",
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    actorRows(adminRow());
    const request = signedRequest({ actor: { ...ACTOR, grant }, n: 1 });
    expect((await POST(request)).status).toBe(200);
    expect(onlyLine()).toEqual({
      event: "console_internal.outcome",
      path: PATH,
      actorId: "u_admin",
      grant: true,
      status: 200,
      code: "ok",
    });
    expect(allLines().join("\n")).not.toContain(grant);
    expectNoSecrets(request);
  });

  it("is one info line for a success", async () => {
    actorRows(adminRow());
    const request = signedRequest({ actor: ACTOR, n: 1, reason: "Ticket 9" });
    expect((await POST(request)).status).toBe(200);
    expect(onlyLine()).toEqual({
      event: "console_internal.outcome",
      path: PATH,
      actorId: "u_admin",
      grant: false,
      status: 200,
      code: "ok",
    });
    expect(logged.info).toHaveBeenCalledTimes(1);
    expectNoSecrets(request);
  });

  it("names a database error in the admin check by its kind and code, never the query's values", async () => {
    const cause = Object.assign(
      new Error('terminating connection: user "u_admin" session "sess_admin"'),
      { name: "NeonDbError", code: "57P01" },
    );
    state.results.push(
      new DrizzleQueryError(
        'select "id" from "session" where "id" = $1 and "user_id" = $2',
        ["sess_admin", "u_admin"],
        cause,
      ),
      [],
    );
    const request = signedRequest({ actor: ACTOR, n: 1 });
    const response = await POST(request);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Action failed",
    });
    expect(onlyLine()).toEqual({
      event: "console_internal.outcome",
      path: PATH,
      actorId: "u_admin",
      grant: false,
      status: 500,
      code: "failed",
      error: { name: "DrizzleQueryError", code: "57P01" },
    });
    const text = allLines().join("\n");
    for (const leaked of ["Failed query", "params", "$1", "terminating"]) {
      expect(text).not.toContain(leaked);
    }
    expectNoSecrets(request);
    expect(run).not.toHaveBeenCalled();
  });

  it("names a database error in the work the same way (a new address in its params)", async () => {
    run.mockRejectedValue(
      new DrizzleQueryError(
        'update "user" set "email" = $1',
        ["new.owner@example.com"],
        Object.assign(new Error("Key (email)=(new.owner@example.com)"), {
          code: "23505",
        }),
      ),
    );
    actorRows(adminRow());
    const request = signedRequest({ actor: ACTOR, n: 1 });
    expect((await POST(request)).status).toBe(500);
    expect(onlyLine()).toMatchObject({
      status: 500,
      code: "failed",
      error: { name: "DrizzleQueryError", code: "23505" },
    });
    expect(allLines().join("\n")).not.toContain("new.owner");
    expectNoSecrets(request);
  });

  it("keeps the refusals before the signature to their own line, with no admin", async () => {
    const request = signedRequest(
      { actor: ACTOR, n: 1 },
      { secret: "x".repeat(48) },
    );
    expect((await POST(request)).status).toBe(401);
    const line = onlyLine();
    expect(line).toMatchObject({
      event: "console_internal.refused",
      path: PATH,
      status: 401,
    });
    expect(line).not.toHaveProperty("actorId");
    expectNoSecrets(request);
  });
});
