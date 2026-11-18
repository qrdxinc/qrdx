// Each /api/internal/console/* endpoint runs the same work as the admin
// action it stands for (app/(app)/admin/_lib/operations.ts, or Better Auth's
// admin routes through its internal adapter for ban, unban, role and
// sign-out), with the admin the route checked, writes the audit entry that
// action's runner would write (with the signed reason), and asks for strong
// confirmation exactly where it must. The signature, replay and actor checks themselves are in
// route.test.ts; here the actor check is a stub.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "c".repeat(40);
const ACTOR = {
  id: "u_admin",
  email: "admin@qrdx.test",
  name: "Admin",
  role: "admin",
  sessionId: "sess_admin",
  twoFactorEnabled: true,
};

const state = vi.hoisted(() => ({
  env: {
    CONSOLE_INTERNAL_SECRET: "c".repeat(40),
    NEXT_PUBLIC_APP_URL: "https://qrdx.test/",
  },
  strong: true,
  strongCalls: 0,
  target: null as null | { id: string; email: string; role: string | null },
  results: [] as unknown[],
}));

vi.mock("@/env", () => ({ env: state.env }));
const audit = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async (_entry: Record<string, unknown>) => undefined),
}));
vi.mock("@/app/(app)/admin/_lib/audit", () => audit);
/** Each limit check: the limiter's prefix and the key it counted. */
const limitChecks = vi.hoisted(() => [] as { prefix?: string; key: string }[]);
vi.mock("@repo/rate-limit", () => ({
  // Every request id is new here; replay is route.test.ts's.
  redis: { set: async () => "OK" },
  // Never over the limit here; the limits themselves are route.test.ts's.
  createRateLimiter: ({ prefix }: { prefix?: string }) => ({
    limit: async (key: string) => {
      limitChecks.push({ prefix, key });
      return { success: true, limit: 1, remaining: 1, reset: 0 };
    },
  }),
  slidingWindow: () => ({}),
  RateLimitUnavailableError: class extends Error {},
}));

vi.mock("@/lib/console-internal/actor", async () => {
  const { HttpError } = await import("@/lib/http-error");
  return {
    loadConsoleActor: vi.fn(async () => ACTOR),
    requireStrongConsoleActor: vi.fn(async () => {
      state.strongCalls += 1;
      if (!state.strong) {
        throw new HttpError(
          403,
          "CONFIRMATION_REQUIRED",
          "CONFIRMATION_REQUIRED",
        );
      }
    }),
  };
});

const outcome = (name: string) => ({
  audit: { targetType: "test", targetId: name, metadata: { by: name } },
  data: { from: name },
});
const ops = vi.hoisted(() => ({
  markEmailVerified: vi.fn(),
  unlinkSignInMethod: vi.fn(),
  startTwoFactorReset: vi.fn(),
  cancelPendingTwoFactorReset: vi.fn(),
  changeAccountEmail: vi.fn(),
  deleteUserAccount: vi.fn(),
  resendTeamInvitation: vi.fn(),
  retryWebhookDelivery: vi.fn(),
  disconnectIntegration: vi.fn(),
  blockReportedFile: vi.fn(),
  requeueImport: vi.fn(),
  cancelImport: vi.fn(),
  refreshCommunity: vi.fn(),
  refreshCommunityAll: vi.fn(),
}));
vi.mock("@/app/(app)/admin/_lib/operations", async () => {
  const { adminError } = await import("@/app/(app)/admin/_lib/action-runner");
  return {
    ...ops,
    findAdminTarget: vi.fn(async (userId: string) => {
      if (!state.target || state.target.id !== userId) {
        throw adminError("User not found", 404);
      }
      return state.target;
    }),
    // As the admin actions' userAudit.
    userAudit: (
      target: { id: string; email: string },
      metadata: Record<string, unknown> = {},
    ) => ({
      audit: {
        targetType: "user",
        targetId: target.id,
        subjectUserId: target.id,
        metadata: { targetEmail: target.email, ...metadata },
      },
    }),
  };
});

const adapter = vi.hoisted(() => ({
  updateUser: vi.fn(
    async (_userId: string, _data: Record<string, unknown>) => ({}),
  ),
  deleteUserSessions: vi.fn(async (_userId: string) => undefined),
}));
vi.mock("@repo/auth/server", () => ({
  auth: { $context: Promise.resolve({ internalAdapter: adapter }) },
}));

const health = vi.hoisted(() => ({
  getServiceProbes: vi.fn(async () => [
    {
      id: "db",
      name: "Database",
      status: "ok",
      detail: "Reachable",
      latencyMs: 3,
    },
  ]),
  getCronHealth: vi.fn(async () => ({ daily: { lastRunAt: null } })),
  getWebhookBacklog: vi.fn(async () => {
    throw new Error("timed out");
  }),
  getBuildInfo: vi.fn(() => ({ environment: "production", commit: "abc1234" })),
  getConfiguration: vi.fn(() => [
    { name: "Email", on: true, vars: "RESEND_API_KEY" },
  ]),
  getIntegrationHealth: vi.fn(() => [
    {
      slug: "slack",
      name: "Slack",
      available: false,
      missing: ["SLACK_CLIENT_ID"],
    },
  ]),
}));
vi.mock("@/app/(app)/admin/_lib/health", () => health);
const polar = vi.hoisted(() => ({
  getPolarCustomerUrl: vi.fn(
    async (id: string) => `https://polar.sh/dashboard/qrdx/customers/${id}`,
  ),
}));
vi.mock("@/app/(app)/admin/_lib/polar", () => polar);

vi.mock("@repo/database", () => {
  const chain = (): unknown =>
    new Proxy(() => undefined, {
      get: (_target, key) =>
        key === "then"
          ? (resolve: (value: unknown) => void) =>
              resolve(state.results.length ? state.results.shift() : [])
          : () => chain(),
    });
  return {
    database: { select: () => chain() },
    user: { id: "user.id", email: "user.email" },
  };
});
vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));
const exporter = vi.hoisted(() => ({
  exportArchiveStream: vi.fn(
    () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("PK"));
          controller.close();
        },
      }),
  ),
  exportEntries: vi.fn(() => []),
}));
vi.mock("@/lib/account/export/archive", () => ({
  exportArchiveStream: exporter.exportArchiveStream,
}));
vi.mock("@/lib/account/export/entries", () => ({
  EXPORT_INTRO: "intro",
  exportEntries: exporter.exportEntries,
}));
vi.mock("@/lib/log-error", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/log-error")>()),
  logError: vi.fn(),
}));

const {
  consoleSignature,
  REQUEST_ID_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} = await import("@/lib/console-internal/signature");

const routes = {
  "users/ban": () => import("@/app/api/internal/console/users/ban/route"),
  "users/unban": () => import("@/app/api/internal/console/users/unban/route"),
  "users/role": () => import("@/app/api/internal/console/users/role/route"),
  "users/revoke-sessions": () =>
    import("@/app/api/internal/console/users/revoke-sessions/route"),
  "users/mark-email-verified": () =>
    import("@/app/api/internal/console/users/mark-email-verified/route"),
  "users/unlink-sign-in": () =>
    import("@/app/api/internal/console/users/unlink-sign-in/route"),
  "users/two-factor-reset": () =>
    import("@/app/api/internal/console/users/two-factor-reset/route"),
  "users/two-factor-reset/cancel": () =>
    import("@/app/api/internal/console/users/two-factor-reset/cancel/route"),
  "users/change-email": () =>
    import("@/app/api/internal/console/users/change-email/route"),
  "users/delete": () => import("@/app/api/internal/console/users/delete/route"),
  "users/export": () => import("@/app/api/internal/console/users/export/route"),
  "invitations/resend": () =>
    import("@/app/api/internal/console/invitations/resend/route"),
  "webhook-deliveries/retry": () =>
    import("@/app/api/internal/console/webhook-deliveries/retry/route"),
  "integrations/disconnect": () =>
    import("@/app/api/internal/console/integrations/disconnect/route"),
  "files/block": () => import("@/app/api/internal/console/files/block/route"),
  "imports/requeue": () =>
    import("@/app/api/internal/console/imports/requeue/route"),
  "imports/cancel": () =>
    import("@/app/api/internal/console/imports/cancel/route"),
  "community/revalidate": () =>
    import("@/app/api/internal/console/community/revalidate/route"),
  health: () => import("@/app/api/internal/console/health/route"),
  "billing/polar-customer-url": () =>
    import("@/app/api/internal/console/billing/polar-customer-url/route"),
} as const;
type RoutePath = keyof typeof routes;

let counter = 0;
async function call(path: RoutePath, fields: Record<string, unknown> = {}) {
  const { POST } = (await routes[path]()) as {
    POST: (request: NextRequest) => Promise<Response>;
  };
  const pathname = `/api/internal/console/${path}`;
  const body = JSON.stringify({
    actor: { userId: ACTOR.id, sessionId: ACTOR.sessionId },
    ...fields,
  });
  const parts = {
    timestamp: String(Math.floor(Date.now() / 1000)),
    requestId: (counter++).toString(16).padStart(32, "0"),
    pathname,
    body,
  };
  return POST(
    new NextRequest(`https://qrdx.test${pathname}`, {
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
const json = async (response: Response) =>
  [response.status, await response.json()] as const;

const reason = "Ticket 1234";

beforeEach(() => {
  limitChecks.length = 0;
  // Each request's outcome line; checked in route.test.ts.
  for (const level of ["info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation(() => undefined);
  }
  state.strong = true;
  state.strongCalls = 0;
  state.target = { id: "u_target", email: "target@example.com", role: "user" };
  state.results = [];
  for (const [name, fn] of Object.entries(ops)) {
    fn.mockReset();
    fn.mockResolvedValue(outcome(name));
  }
  adapter.updateUser.mockClear();
  adapter.deleteUserSessions.mockClear();
  audit.writeAuditLog.mockClear();
});

/** The audit entries the endpoints wrote, in order. */
const written = () =>
  audit.writeAuditLog.mock.calls.map(([entry]) => entry as Record<string, any>);

/** The audit action each endpoint records, as the admin page's action does. */
const ACTIONS: Partial<Record<RoutePath, string>> = {
  "users/mark-email-verified": "user.mark_email_verified",
  "users/unlink-sign-in": "user.unlink_sign_in",
  "users/two-factor-reset": "user.reset_two_factor",
  "users/two-factor-reset/cancel": "user.reset_two_factor_cancel",
  "users/change-email": "user.change_email",
  "users/delete": "user.delete",
  "invitations/resend": "invitation.resend",
  "webhook-deliveries/retry": "webhook_delivery.retry",
  "integrations/disconnect": "integration.disconnect",
  "files/block": "abuse_report.block_file",
  "imports/requeue": "import_job.requeue",
  "imports/cancel": "import_job.cancel",
};

// Endpoints whose work is a shared operation: the operation gets the checked
// admin and the parsed input (and, for the strong ones, a check that asks
// again at the same point the admin action does).
const SHARED: [
  RoutePath,
  keyof typeof ops,
  Record<string, unknown>,
  boolean,
][] = [
  [
    "users/mark-email-verified",
    "markEmailVerified",
    { userId: "u_target", reason },
    false,
  ],
  [
    "users/unlink-sign-in",
    "unlinkSignInMethod",
    { userId: "u_target", accountId: "acct_1", reason },
    false,
  ],
  [
    "users/two-factor-reset",
    "startTwoFactorReset",
    { userId: "u_target", reason },
    true,
  ],
  [
    "users/two-factor-reset/cancel",
    "cancelPendingTwoFactorReset",
    { userId: "u_target", reason },
    true,
  ],
  [
    "users/change-email",
    "changeAccountEmail",
    { userId: "u_target", newEmail: "new@example.com", reason },
    true,
  ],
  [
    "users/delete",
    "deleteUserAccount",
    { userId: "u_target", confirmation: "target@example.com", reason },
    true,
  ],
  [
    "invitations/resend",
    "resendTeamInvitation",
    { invitationId: "inv_1", reason },
    false,
  ],
  [
    "webhook-deliveries/retry",
    "retryWebhookDelivery",
    { deliveryId: "del_1", reason },
    false,
  ],
  [
    "integrations/disconnect",
    "disconnectIntegration",
    { integrationId: "int_1", reason },
    false,
  ],
  [
    "files/block",
    "blockReportedFile",
    { reportId: "rep_1", fileId: "file_1", reason },
    false,
  ],
  [
    "imports/requeue",
    "requeueImport",
    { userId: "u_target", jobId: "job_1", reason },
    false,
  ],
  [
    "imports/cancel",
    "cancelImport",
    { userId: "u_target", jobId: "job_1", reason },
    false,
  ],
];

describe("endpoints on the shared operations", () => {
  it.each(SHARED)(
    "%s runs %s and writes its audit entry",
    async (path, name, fields, strong) => {
      const [status, body] = await json(await call(path, fields));
      expect(status).toBe(200);
      expect(body).toEqual({ ok: true, data: outcome(name).data });
      expect(written()).toEqual([
        {
          actor: ACTOR,
          action: ACTIONS[path],
          targetType: "test",
          targetId: name,
          metadata: { by: name, reason, via: "console" },
        },
      ]);
      const fn = ops[name];
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn.mock.calls[0]?.[0]).toEqual(ACTOR);
      expect(fn.mock.calls[0]?.[1]).toEqual(fields);
      // Strong ones were checked before the work started.
      expect(state.strongCalls).toBe(strong ? 1 : 0);
    },
  );

  it.each(SHARED.filter(([, , , strong]) => strong))(
    "%s refuses without a strong confirmation, before any work",
    async (path, name, fields) => {
      state.strong = false;
      const [status, body] = await json(await call(path, fields));
      expect(status).toBe(403);
      expect(body).toEqual({ ok: false, error: "CONFIRMATION_REQUIRED" });
      expect(ops[name]).not.toHaveBeenCalled();
      expect(written()).toEqual([]);
    },
  );

  it("the strong operations ask again where the admin action asks", async () => {
    // Deletion has no second check: the admin action asks for none.
    for (const [path, name, fields] of SHARED.filter(
      ([p, , , strong]) => strong && p !== "users/delete",
    )) {
      ops[name].mockImplementation(
        async (
          _admin,
          _input,
          check: { requireStrong: () => Promise<void> },
        ) => {
          await check.requireStrong();
          return outcome(name);
        },
      );
      state.strongCalls = 0;
      expect((await call(path, fields)).status, path).toBe(200);
      expect(state.strongCalls, path).toBe(2);
    }
  });

  it("deletion hands the organization plugin no session", async () => {
    await call("users/delete", {
      userId: "u_target",
      confirmation: "target@example.com",
      reason,
    });
    const options = ops.deleteUserAccount.mock.calls[0]?.[2] as {
      requestHeaders: Headers;
    };
    expect(options.requestHeaders).toBeInstanceOf(Headers);
    expect([...options.requestHeaders.keys()]).toEqual([]);
  });

  it("change-email gets the address as the admin action does (trimmed, lower case)", async () => {
    await call("users/change-email", {
      userId: "u_target",
      newEmail: "  New@Example.COM ",
      reason,
    });
    expect(ops.changeAccountEmail.mock.calls[0]?.[1]).toEqual({
      userId: "u_target",
      newEmail: "new@example.com",
      reason,
    });
  });

  it("refuses input the admin action would refuse", async () => {
    const [status, body] = await json(
      await call("users/unlink-sign-in", { userId: "u_target", reason: "x" }),
    );
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(ops.unlinkSignInMethod).not.toHaveBeenCalled();
    expect(
      (await call("users/delete", { userId: "u_target", reason })).status,
    ).toBe(400);
  });

  it("passes an operation's refusal through", async () => {
    const { adminError } = await import("@/app/(app)/admin/_lib/action-runner");
    ops.markEmailVerified.mockRejectedValue(adminError("User not found", 404));
    expect(
      await json(
        await call("users/mark-email-verified", { userId: "u_x", reason }),
      ),
    ).toEqual([404, { ok: false, error: "User not found" }]);
  });

  it("records nothing when the operation changed nothing", async () => {
    ops.markEmailVerified.mockResolvedValue(null);
    expect(
      await json(
        await call("users/mark-email-verified", { userId: "u_target", reason }),
      ),
    ).toEqual([200, { ok: true }]);
    expect(written()).toEqual([]);
  });

  it("records nothing when the operation refused", async () => {
    const { adminError } = await import("@/app/(app)/admin/_lib/action-runner");
    ops.disconnectIntegration.mockRejectedValue(adminError("Nope"));
    expect(
      (await call("integrations/disconnect", { integrationId: "i", reason }))
        .status,
    ).toBe(400);
    expect(written()).toEqual([]);
  });

  it("unlink hands the operation a strong check, for an admin's sign-in", async () => {
    ops.unlinkSignInMethod.mockImplementation(
      async (_admin, _input, check: { requireStrong: () => Promise<void> }) => {
        await check.requireStrong();
        return outcome("unlinkSignInMethod");
      },
    );
    state.strong = false;
    expect(
      await json(
        await call("users/unlink-sign-in", {
          userId: "u_target",
          accountId: "acct_1",
          reason,
        }),
      ),
    ).toEqual([403, { ok: false, error: "CONFIRMATION_REQUIRED" }]);
    expect(written()).toEqual([]);
    state.strong = true;
    expect(
      (
        await call("users/unlink-sign-in", {
          userId: "u_target",
          accountId: "acct_1",
          reason,
        })
      ).status,
    ).toBe(200);
  });

  it("mark-email-verified hands the operation a strong check, for an account it would make an admin", async () => {
    ops.markEmailVerified.mockImplementation(
      async (_admin, _input, check: { requireStrong: () => Promise<void> }) => {
        await check.requireStrong();
        return outcome("markEmailVerified");
      },
    );
    state.strong = false;
    expect(
      await json(
        await call("users/mark-email-verified", { userId: "u_target", reason }),
      ),
    ).toEqual([403, { ok: false, error: "CONFIRMATION_REQUIRED" }]);
    expect(written()).toEqual([]);
  });
});

describe("ban, unban, role and sign-out (Better Auth's admin routes)", () => {
  it("bans: the user row, every session, the community lists", async () => {
    const before = Date.now();
    const [status, body] = await json(
      await call("users/ban", { userId: "u_target", reason, expiresInDays: 7 }),
    );
    expect(status).toBe(200);
    expect(adapter.updateUser).toHaveBeenCalledWith("u_target", {
      banned: true,
      banReason: reason,
      banExpires: expect.any(Date),
      updatedAt: expect.any(Date),
    });
    const fields = adapter.updateUser.mock.calls[0]?.[1] as unknown as {
      banExpires: Date;
    };
    const expected = before + 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(fields.banExpires.getTime() - expected)).toBeLessThan(5000);
    expect(adapter.deleteUserSessions).toHaveBeenCalledWith("u_target");
    expect(ops.refreshCommunity).toHaveBeenCalledTimes(1);
    expect(body).toEqual({ ok: true });
    expect(written()).toEqual([
      {
        actor: ACTOR,
        action: "user.ban",
        targetType: "user",
        targetId: "u_target",
        metadata: {
          targetEmail: "target@example.com",
          expiresInDays: 7,
          reason,
          subjectUserId: "u_target",
          via: "console",
        },
      },
    ]);
    expect(state.strongCalls).toBe(0);
  });

  it("bans without an end", async () => {
    await call("users/ban", { userId: "u_target", reason });
    expect(adapter.updateUser.mock.calls[0]?.[1]).toMatchObject({
      banExpires: null,
    });
    expect(written()[0]?.metadata).toMatchObject({
      targetEmail: "target@example.com",
      expiresInDays: null,
    });
  });

  it("bans another admin only with a strong confirmation", async () => {
    // The target's own row says admin (the role here; ADMIN_EMAILS and
    // ADMIN_USER_IDS count the same through isAdmin).
    state.results = [
      [
        {
          id: "u_target",
          email: "t@example.com",
          emailVerified: true,
          role: "admin",
        },
      ],
    ];
    state.strong = false;
    expect(
      await json(await call("users/ban", { userId: "u_target", reason })),
    ).toEqual([403, { ok: false, error: "CONFIRMATION_REQUIRED" }]);
    expect(adapter.updateUser).not.toHaveBeenCalled();
    expect(written()).toEqual([]);
    state.strong = true;
    state.results = [
      [
        {
          id: "u_target",
          email: "t@example.com",
          emailVerified: true,
          role: "admin",
        },
      ],
    ];
    expect(
      (await call("users/ban", { userId: "u_target", reason })).status,
    ).toBe(200);
    expect(state.strongCalls).toBe(2);
  });

  it("never bans the admin themselves, or a user that doesn't exist", async () => {
    expect(
      await json(await call("users/ban", { userId: ACTOR.id, reason })),
    ).toEqual([400, { ok: false, error: "You cannot ban yourself" }]);
    expect(
      (await call("users/ban", { userId: "u_missing", reason })).status,
    ).toBe(404);
    expect(adapter.updateUser).not.toHaveBeenCalled();
    expect(adapter.deleteUserSessions).not.toHaveBeenCalled();
  });

  it("unbans", async () => {
    const [status, body] = await json(
      await call("users/unban", { userId: "u_target", reason }),
    );
    expect(status).toBe(200);
    expect(adapter.updateUser).toHaveBeenCalledWith("u_target", {
      banned: false,
      banExpires: null,
      banReason: null,
      updatedAt: expect.any(Date),
    });
    expect(ops.refreshCommunity).toHaveBeenCalledTimes(1);
    expect(body).toEqual({ ok: true });
    expect(written()[0]).toMatchObject({
      action: "user.unban",
      metadata: { targetEmail: "target@example.com", reason },
    });
  });

  // Unbanning a banned admin hands the console back to them; signing one out
  // everywhere locks them out of it. Both take the strong confirmation that
  // banning one does.
  it.each([
    ["users/unban", "updateUser"],
    ["users/revoke-sessions", "deleteUserSessions"],
  ] as const)(
    "%s for another admin only with a strong confirmation",
    async (path, effect) => {
      const adminRow = {
        id: "u_target",
        email: "t@example.com",
        emailVerified: true,
        role: "admin",
      };
      state.results = [[adminRow]];
      state.strong = false;
      expect(
        await json(await call(path, { userId: "u_target", reason })),
      ).toEqual([403, { ok: false, error: "CONFIRMATION_REQUIRED" }]);
      expect(adapter[effect]).not.toHaveBeenCalled();
      expect(written()).toEqual([]);
      state.strong = true;
      state.results = [[adminRow]];
      expect((await call(path, { userId: "u_target", reason })).status).toBe(
        200,
      );
      expect(adapter[effect]).toHaveBeenCalledTimes(1);
      expect(state.strongCalls).toBe(2);
    },
  );

  it.each(["users/unban", "users/revoke-sessions"] as const)(
    "%s asks nothing more for a user who isn't an admin",
    async (path) => {
      state.results = [
        [
          {
            id: "u_target",
            email: "t@example.com",
            emailVerified: true,
            role: "user",
          },
        ],
      ];
      state.strong = false;
      expect((await call(path, { userId: "u_target", reason })).status).toBe(
        200,
      );
      expect(state.strongCalls).toBe(0);
    },
  );

  it("removes another admin's role only with a strong confirmation", async () => {
    state.target = {
      id: "u_target",
      email: "target@example.com",
      role: "admin",
    };
    state.strong = false;
    expect(
      await json(
        await call("users/role", { userId: "u_target", role: "user", reason }),
      ),
    ).toEqual([403, { ok: false, error: "CONFIRMATION_REQUIRED" }]);
    expect(adapter.updateUser).not.toHaveBeenCalled();
    state.strong = true;
    const [status] = await json(
      await call("users/role", { userId: "u_target", role: "user", reason }),
    );
    expect(status).toBe(200);
    expect(adapter.updateUser).toHaveBeenCalledWith("u_target", {
      role: "user",
    });
    expect(written()[0]).toMatchObject({
      action: "user.set_role",
      metadata: {
        targetEmail: "target@example.com",
        from: "admin",
        to: "user",
        reason,
      },
    });
  });

  it("grants the admin role only with a strong confirmation", async () => {
    state.strong = false;
    expect(
      await json(
        await call("users/role", { userId: "u_target", role: "admin", reason }),
      ),
    ).toEqual([403, { ok: false, error: "CONFIRMATION_REQUIRED" }]);
    expect(adapter.updateUser).not.toHaveBeenCalled();
    state.strong = true;
    expect(
      (await call("users/role", { userId: "u_target", role: "admin", reason }))
        .status,
    ).toBe(200);
    expect(adapter.updateUser).toHaveBeenCalledWith("u_target", {
      role: "admin",
    });
  });

  it("records nothing when the role is already so, and never demotes the admin", async () => {
    expect(
      await json(
        await call("users/role", { userId: "u_target", role: "user", reason }),
      ),
    ).toEqual([200, { ok: true }]);
    expect(written()).toEqual([]);
    expect(
      (
        await json(
          await call("users/role", { userId: ACTOR.id, role: "user", reason }),
        )
      )[1],
    ).toEqual({ ok: false, error: "You cannot remove your own admin role" });
    expect(adapter.updateUser).not.toHaveBeenCalled();
  });

  it("signs a user out everywhere", async () => {
    const [status, body] = await json(
      await call("users/revoke-sessions", { userId: "u_target", reason }),
    );
    expect(status).toBe(200);
    expect(adapter.deleteUserSessions).toHaveBeenCalledWith("u_target");
    expect(body).toEqual({ ok: true });
    expect(written()[0]).toMatchObject({
      action: "user.revoke_sessions",
      targetId: "u_target",
    });
  });
});

describe("reads", () => {
  it("health names this deployment and keeps a failed section to itself", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const [status, body] = await json(await call("health"));
    log.mockRestore();
    expect(status).toBe(200);
    expect(body).toEqual({
      ok: true,
      data: {
        deployment: "https://qrdx.test",
        build: { environment: "production", commit: "abc1234" },
        probes: [
          {
            id: "db",
            name: "Database",
            status: "ok",
            detail: "Reachable",
            latencyMs: 3,
          },
        ],
        cron: { ok: true, data: { daily: { lastRunAt: null } } },
        webhooks: { ok: false },
        configuration: [{ name: "Email", on: true, vars: "RESEND_API_KEY" }],
        integrations: [
          {
            slug: "slack",
            name: "Slack",
            available: false,
            missing: ["SLACK_CLIENT_ID"],
          },
        ],
      },
    });
  });

  it("the Polar link for a customer", async () => {
    expect(
      await json(
        await call("billing/polar-customer-url", { customerId: "cus_1" }),
      ),
    ).toEqual([
      200,
      {
        ok: true,
        data: { url: "https://polar.sh/dashboard/qrdx/customers/cus_1" },
      },
    ]);
    expect(polar.getPolarCustomerUrl).toHaveBeenCalledWith("cus_1");
  });

  it("community lists refreshed", async () => {
    expect(await json(await call("community/revalidate"))).toEqual([
      200,
      { ok: true },
    ]);
    expect(ops.refreshCommunityAll).toHaveBeenCalledTimes(1);
    expect(written()).toEqual([]);
  });

  it("a user's export, streamed as a ZIP", async () => {
    state.results = [[{ id: "u_target", email: "target@example.com" }]];
    const response = await call("users/export", { userId: "u_target", reason });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="qrdx-data-u_target-\d{4}-\d{2}-\d{2}\.zip"$/,
    );
    expect(await response.text()).toBe("PK");
    expect(exporter.exportEntries).toHaveBeenCalledWith("u_target");
    // On record, with the reason, before the stream.
    expect(written()).toEqual([
      {
        actor: ACTOR,
        action: "user.export",
        targetType: "user",
        targetId: "u_target",
        metadata: {
          targetEmail: "target@example.com",
          subjectUserId: "u_target",
          reason,
          via: "console",
        },
      },
    ]);
  });

  it("no export without a reason", async () => {
    expect((await call("users/export", { userId: "u_target" })).status).toBe(
      400,
    );
    expect(exporter.exportEntries).not.toHaveBeenCalled();
  });

  it("no export for a user that doesn't exist", async () => {
    state.results = [[]];
    expect(
      await json(await call("users/export", { userId: "u_missing", reason })),
    ).toEqual([404, { ok: false, error: "User not found" }]);
    expect(written()).toEqual([]);
  });
});

describe("rate limits", () => {
  // What each endpoint counts against (per admin): its audit action, or its
  // path for the reads, and the sensitive tier (5 an hour) where the admin
  // pages use it, plus the export and the reset's cancel.
  const LIMITS: Record<RoutePath, [string, "standard" | "sensitive"]> = {
    "users/ban": ["user.ban", "standard"],
    "users/unban": ["user.unban", "standard"],
    "users/role": ["user.set_role", "standard"],
    "users/revoke-sessions": ["user.revoke_sessions", "standard"],
    "users/mark-email-verified": ["user.mark_email_verified", "standard"],
    "users/unlink-sign-in": ["user.unlink_sign_in", "standard"],
    "users/two-factor-reset": ["user.reset_two_factor", "sensitive"],
    "users/two-factor-reset/cancel": [
      "user.reset_two_factor_cancel",
      "sensitive",
    ],
    "users/change-email": ["user.change_email", "sensitive"],
    "users/delete": ["user.delete", "sensitive"],
    "users/export": ["user.export", "sensitive"],
    "invitations/resend": ["invitation.resend", "standard"],
    "webhook-deliveries/retry": ["webhook_delivery.retry", "standard"],
    "integrations/disconnect": ["integration.disconnect", "standard"],
    "files/block": ["abuse_report.block_file", "standard"],
    "imports/requeue": ["import_job.requeue", "standard"],
    "imports/cancel": ["import_job.cancel", "standard"],
    "community/revalidate": [
      "/api/internal/console/community/revalidate",
      "standard",
    ],
    health: ["/api/internal/console/health", "standard"],
    "billing/polar-customer-url": [
      "/api/internal/console/billing/polar-customer-url",
      "standard",
    ],
  };

  it.each(Object.keys(routes) as RoutePath[])(
    "%s counts once, per admin, in its tier, before its work",
    async (path) => {
      const [name, tier] = LIMITS[path];
      // No fields: the limit comes before the input check.
      await call(path);
      expect(limitChecks).toEqual([
        {
          prefix:
            tier === "sensitive"
              ? "qrdx:console-internal-sensitive"
              : "qrdx:console-internal",
          key: `${name}:${ACTOR.id}`,
        },
      ]);
    },
  );
});
