// The console's email endpoints (/api/internal/console/emails/preview and
// /send): their fields, the 503 while personal notes are off, strong
// confirmation only for more than one person, the standard limit, and no
// audit entry of their own (the notes write one each,
// tests/email/personal-notes.test.tsx). The signature, replay and actor
// checks are route.test.ts's; the actor check is a stub here, and the notes'
// own work is stubbed.
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
    BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
    EMAIL_FROM_PERSONAL: "Ritesh from QRdx <support@qrdx.dev>" as
      | string
      | undefined,
  },
  emailOn: true,
  strong: true,
  strongCalls: 0,
}));

vi.mock("@/env", () => ({ env: state.env }));
vi.mock("@/lib/email/send", () => ({
  get isEmailConfigured() {
    return state.emailOn;
  },
  sendEmail: vi.fn(),
}));
vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
const audit = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async (_entry: Record<string, unknown>) => undefined),
}));
vi.mock("@/app/(app)/admin/_lib/audit", () => audit);
const limitChecks = vi.hoisted(() => [] as { prefix?: string; key: string }[]);
vi.mock("@repo/rate-limit", () => ({
  redis: { set: async () => "OK" },
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
const notes = vi.hoisted(() => ({
  previewPersonalNote: vi.fn(),
  sendPersonalNotes: vi.fn(),
}));
vi.mock("@/lib/email/personal-notes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/personal-notes")>()),
  ...notes,
}));

const {
  consoleSignature,
  REQUEST_ID_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} = await import("@/lib/console-internal/signature");

const routes = {
  "emails/preview": () =>
    import("@/app/api/internal/console/emails/preview/route"),
  "emails/send": () => import("@/app/api/internal/console/emails/send/route"),
} as const;

let counter = 0;
async function call(
  path: keyof typeof routes,
  fields: Record<string, unknown>,
) {
  const { POST } = (await routes[path]()) as {
    POST: (request: NextRequest) => Promise<Response>;
  };
  const pathname = `/api/internal/console/${path}`;
  const body = JSON.stringify({
    actor: {
      userId: ACTOR.id,
      sessionId: ACTOR.sessionId,
      grant: "g".repeat(43),
    },
    ...fields,
  });
  const parts = {
    timestamp: String(Math.floor(Date.now() / 1000)),
    requestId: (counter++).toString(16).padStart(32, "0"),
    pathname,
    body,
  };
  const response = await POST(
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
  return [response.status, await response.json()] as const;
}

const message = (userId: string) => ({
  userId,
  subject: "Hi {first_name}",
  body: "How is QRdx working for you?",
});
const sendFields = (messages: unknown[], extra: object = {}) => ({
  template: "personal-note",
  campaign: "warm-check-in",
  reason: "Warm check-ins",
  messages,
  ...extra,
});
const SENDER = {
  from: "Ritesh from QRdx <support@qrdx.dev>",
  name: "Ritesh from QRdx",
  address: "support@qrdx.dev",
};

beforeEach(() => {
  for (const level of ["info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation(() => undefined);
  }
  state.env.EMAIL_FROM_PERSONAL = "Ritesh from QRdx <support@qrdx.dev>";
  state.emailOn = true;
  state.strong = true;
  state.strongCalls = 0;
  limitChecks.length = 0;
  audit.writeAuditLog.mockClear();
  notes.previewPersonalNote.mockReset();
  notes.previewPersonalNote.mockResolvedValue({
    subject: "Hi Sam",
    html: "<p>Hi</p>",
    text: "Hi",
    skip: null,
  });
  notes.sendPersonalNotes.mockReset();
  notes.sendPersonalNotes.mockImplementation(
    async ({ messages }: { messages: { userId: string }[] }) =>
      messages.map(({ userId }) => ({ userId, status: "sent", id: "em_1" })),
  );
});

describe("emails/preview", () => {
  it("answers the note as the person would get it, without asking for strong confirmation", async () => {
    expect(
      await call("emails/preview", {
        template: "personal-note",
        ...message("u_1"),
      }),
    ).toEqual([
      200,
      {
        ok: true,
        data: { subject: "Hi Sam", html: "<p>Hi</p>", text: "Hi", skip: null },
      },
    ]);
    expect(notes.previewPersonalNote).toHaveBeenCalledWith(
      { template: "personal-note", ...message("u_1") },
      SENDER,
    );
    expect(state.strongCalls).toBe(0);
    expect(audit.writeAuditLog).not.toHaveBeenCalled();
  });

  it("refuses another template and an empty subject or body", async () => {
    for (const fields of [
      { template: "welcome", ...message("u_1") },
      { template: "personal-note", ...message("u_1"), subject: " " },
      { template: "personal-note", ...message("u_1"), body: "" },
      { template: "personal-note", ...message("u_1"), body: "x".repeat(2001) },
    ]) {
      const [status] = await call("emails/preview", fields);
      expect(status, JSON.stringify(fields).slice(0, 60)).toBe(400);
    }
    expect(notes.previewPersonalNote).not.toHaveBeenCalled();
  });
});

describe("emails/send", () => {
  it("sends and answers each person's result, with no audit entry of its own", async () => {
    const [status, body] = await call(
      "emails/send",
      sendFields([message("u_1")]),
    );
    expect([status, body]).toEqual([
      200,
      {
        ok: true,
        data: { results: [{ userId: "u_1", status: "sent", id: "em_1" }] },
      },
    ]);
    expect(notes.sendPersonalNotes).toHaveBeenCalledWith(
      sendFields([message("u_1")]),
      { actor: expect.objectContaining({ id: "u_admin" }), sender: SENDER },
    );
    expect(audit.writeAuditLog).not.toHaveBeenCalled();
    expect(limitChecks).toEqual([
      { prefix: "qrdx:console-internal", key: "email.personal_note:u_admin" },
    ]);
  });

  it("asks for strong confirmation only when it goes to more than one person", async () => {
    state.strong = false;
    expect((await call("emails/send", sendFields([message("u_1")])))[0]).toBe(
      200,
    );
    expect(state.strongCalls).toBe(0);
    const [status] = await call(
      "emails/send",
      sendFields([message("u_1"), message("u_2")]),
    );
    expect(status).toBe(403);
    expect(state.strongCalls).toBe(1);
    expect(notes.sendPersonalNotes).toHaveBeenCalledTimes(1);
    state.strong = true;
    expect(
      (
        await call("emails/send", sendFields([message("u_1"), message("u_2")]))
      )[0],
    ).toBe(200);
  });

  it("takes 1 to 25 people, once each, a slug campaign and a reason", async () => {
    const many = Array.from({ length: 26 }, (_, index) =>
      message(`u_${index}`),
    );
    for (const fields of [
      sendFields([]),
      sendFields(many),
      sendFields([message("u_1"), message("u_1")]),
      sendFields([message("u_1")], { campaign: "Warm Check-in" }),
      sendFields([message("u_1")], { campaign: "ab" }),
      sendFields([message("u_1")], { campaign: "x".repeat(41) }),
      sendFields([message("u_1")], { reason: "" }),
      sendFields([message("u_1")], { template: "welcome" }),
    ]) {
      const [status] = await call("emails/send", fields);
      expect(status, JSON.stringify(fields).slice(0, 80)).toBe(400);
    }
    expect(notes.sendPersonalNotes).not.toHaveBeenCalled();
    expect((await call("emails/send", sendFields(many.slice(0, 25))))[0]).toBe(
      200,
    );
  });
});

describe("while personal notes are off", () => {
  it("answers 503 personal_email_not_configured without EMAIL_FROM_PERSONAL", async () => {
    state.env.EMAIL_FROM_PERSONAL = undefined;
    expect(
      await call("emails/preview", {
        template: "personal-note",
        ...message("u_1"),
      }),
    ).toEqual([503, { ok: false, error: "personal_email_not_configured" }]);
    expect(await call("emails/send", sendFields([message("u_1")]))).toEqual([
      503,
      { ok: false, error: "personal_email_not_configured" },
    ]);
    expect(notes.previewPersonalNote).not.toHaveBeenCalled();
    expect(notes.sendPersonalNotes).not.toHaveBeenCalled();
  });

  it("answers 503 email_not_configured without Resend", async () => {
    state.emailOn = false;
    expect(await call("emails/send", sendFields([message("u_1")]))).toEqual([
      503,
      { ok: false, error: "email_not_configured" },
    ]);
    expect(notes.sendPersonalNotes).not.toHaveBeenCalled();
  });
});
