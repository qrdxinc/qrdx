// The steps every /api/internal/console/* endpoint runs
// (lib/console-internal/route.ts and actor.ts): off without a long enough
// secret, a fresh and matching signature, each request id once, the admin
// checked again against this app's database (role, verified email, no ban,
// the named qrdx.dev session alive and theirs), and for strong endpoints the
// admin's own second factor and a recent strong confirmation by that session.
//
// The database is a scripted fake; nothing connects anywhere.
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
vi.mock("@repo/rate-limit", () => ({
  // Read on every request, so a test can take Upstash away.
  get redis() {
    return state.redisMissing ? null : replayStore;
  },
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
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
          return (resolve: (value: unknown) => void) => resolve(result);
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
    oauthApp: table("oauth_app"),
    oauthToken: table("oauth_token"),
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ op: "and", args }),
  eq: (left: unknown, right: unknown) => ({ op: "eq", left, right }),
  gt: (left: unknown, right: unknown) => ({ op: "gt", left, right }),
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

beforeEach(() => {
  state.env.CONSOLE_INTERNAL_SECRET = SECRET;
  state.calls = [];
  state.results = [];
  state.seen.clear();
  state.redisDown = false;
  state.redisMissing = false;
  audit.writeAuditLog.mockClear();
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

  it("write nothing when nothing changed, or the work failed", async () => {
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
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { status } = await answer(
      await unnamed(signedRequest({ actor: ACTOR })),
    );
    log.mockRestore();
    expect(status).toBe(500);
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

  it("hide anything else", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    run.mockRejectedValue(new Error("connection refused at 10.0.0.1"));
    actorRows(adminRow());
    expect(
      await answer(await POST(signedRequest({ actor: ACTOR, n: 1 }))),
    ).toMatchObject({
      status: 500,
      body: { ok: false, error: "Action failed" },
    });
    log.mockRestore();
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
