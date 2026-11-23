// Personal notes from the console (lib/email/personal-notes.tsx): one email
// per person, looked up by id; skips (opted out, banned, reserved address,
// unknown, already sent in the campaign) are answers, never errors; the
// idempotency key, tags, sender and one-click link; one audit entry per note
// sent; {first_name}; the template's paragraphs and footer. The tables are
// in memory and sendEmail is captured: nothing is sent or stored.
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  auditFails: false,
  lockReleaseFails: false,
  budget: 60,
  used: new Map<string, number>(),
  store: new Map<string, string>(),
  sendResult: { sent: true, id: "em_1" } as
    | { sent: true; id: string }
    | { sent: false; reason: "failed"; error: string; code?: string },
  sent: [] as {
    to: string;
    from?: string;
    replyTo?: string;
    subject: string;
    react: ReactElement;
    unsubscribeUrl?: string;
    idempotencyKey?: string;
    tags?: { name: string; value: string }[];
  }[],
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
// Redis: the batch lock, and the hourly budget counted per admin.
vi.mock("@repo/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/rate-limit")>()),
  redis: {
    set: async (key: string, value: string, options?: { nx?: boolean }) => {
      if (options?.nx && state.store.has(key)) return null;
      state.store.set(key, value);
      return "OK";
    },
    // The lock's compare-and-delete script.
    eval: async (_script: string, [key]: string[], [token]: string[]) => {
      if (state.lockReleaseFails) throw new Error("redis down");
      if (state.store.get(key) !== token) return 0;
      return Number(state.store.delete(key));
    },
  },
  // Upstash's sliding window: a full window refuses without counting; one
  // with room counts first, and refuses when that went past the limit.
  createRateLimiter: () => ({
    limit: async (key: string, rate = 1) => {
      const used = state.used.get(key) ?? 0;
      const answer = (success: boolean, total: number) => ({
        success,
        limit: state.budget,
        remaining: Math.max(0, state.budget - total),
        reset: Date.now() + 60_000,
        pending: Promise.resolve(),
      });
      if (rate > 0 && used >= state.budget) return answer(false, used);
      state.used.set(key, used + rate);
      return answer(used + rate <= state.budget, used + rate);
    },
  }),
}));
vi.mock("@/app/(app)/admin/_lib/audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/app/(app)/admin/_lib/audit")>();
  return {
    writeAuditLog: async (
      entry: Parameters<typeof actual.writeAuditLog>[0],
    ) => {
      if (state.auditFails) throw new Error("db down");
      return actual.writeAuditLog(entry);
    },
  };
});
vi.mock("@/lib/email/send", () => ({
  isEmailConfigured: true,
  sendEmail: vi.fn(async (options: (typeof state.sent)[number]) => {
    state.sent.push(options);
    return state.sendResult;
  }),
}));

const { needsSignature, noteParagraphs } = await import(
  "@repo/email/templates/personal-note"
);
const { parseSender } = await import("@/lib/email/personal-sender");
const { fillNote, previewPersonalNote, sendPersonalNotes } = await import(
  "@/lib/email/personal-notes"
);
const { greetingName } = await import("@/lib/email/greeting");
const {
  createTeamNotesToken,
  createUnsubscribeToken,
  verifyTeamNotesToken,
  verifyUnsubscribeToken,
} = await import("@/lib/events/unsubscribe");

const SENDER = parseSender("Ritesh from QRdx <support@qrdx.dev>");
const ACTOR = { id: "u_admin", email: "admin@qrdx.dev" };
const PAST = new Date("2026-01-01T00:00:00Z");
const FUTURE = new Date("2099-01-01T00:00:00Z");

const person = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: "Sam Lee",
  email: `${id}@mail.example.org.uk`,
  banned: false,
  banExpires: null,
  locale: null,
  teamNotes: true,
  ...extra,
});

const note = (userId: string) => ({
  userId,
  subject: "Hi {first_name}",
  body: "Hi {first_name},\n\nHow is QRdx working for you?\nTell me.",
});

const send = (
  messages: ReturnType<typeof note>[],
  campaign = "warm-check-in",
) =>
  sendPersonalNotes(
    {
      template: "personal-note",
      campaign,
      reason: "Warm check-ins",
      messages,
    },
    { actor: ACTOR, sender: SENDER, spacingMs: 0 },
  );

beforeEach(() => {
  fakeDb.resetAll();
  state.sent.length = 0;
  state.auditFails = false;
  state.lockReleaseFails = false;
  state.budget = 60;
  state.used.clear();
  state.store.clear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  state.sendResult = { sent: true, id: "em_1" };
  fakeDb.seed("user", [
    person("u_on"),
    person("u_off", { teamNotes: false }),
    person("u_banned", { banned: true }),
    person("u_ban_over", { banned: true, banExpires: PAST }),
    person("u_ban_later", { banned: true, banExpires: FUTURE }),
    person("u_test", { email: "e2e@qrdx.test" }),
    person("u_es", { locale: "es", name: "Ana" }),
    person("u_noname", { name: "  " }),
    person("u_info", { name: "info", email: "info@shop.example.org.uk" }),
    person("u_long", { name: `${"B".repeat(30)} Lee` }),
    person("u_ctrl", { name: "Sam\u0000" }),
  ]);
  fakeDb.seed("adminAuditLog", []);
});

describe("sendPersonalNotes", () => {
  it("sends one email per person and skips the rest, in order", async () => {
    const results = await send(
      [
        "u_on",
        "u_off",
        "u_banned",
        "u_ban_over",
        "u_ban_later",
        "u_test",
        "u_gone",
      ].map(note),
    );
    expect(results).toEqual([
      { userId: "u_on", status: "sent", id: "em_1" },
      { userId: "u_off", status: "skipped", reason: "opted_out" },
      { userId: "u_banned", status: "skipped", reason: "banned" },
      { userId: "u_ban_over", status: "sent", id: "em_1" },
      { userId: "u_ban_later", status: "skipped", reason: "banned" },
      { userId: "u_test", status: "skipped", reason: "reserved_address" },
      { userId: "u_gone", status: "skipped", reason: "not_found" },
    ]);
    expect(state.sent.map((email) => email.to)).toEqual([
      "u_on@mail.example.org.uk",
      "u_ban_over@mail.example.org.uk",
    ]);
  });

  it("sends from EMAIL_FROM_PERSONAL with replies to it, once per campaign and person", async () => {
    await send([note("u_on")]);
    const [email] = state.sent;
    expect(email).toMatchObject({
      to: "u_on@mail.example.org.uk",
      from: "Ritesh from QRdx <support@qrdx.dev>",
      replyTo: "support@qrdx.dev",
      subject: "Hi Sam",
      idempotencyKey: "personal-note:warm-check-in:u_on",
      tags: [
        { name: "kind", value: "personal-note" },
        { name: "campaign", value: "warm-check-in" },
      ],
    });
    // The one-click link turns notes off for this person only.
    const token = new URL(email?.unsubscribeUrl ?? "").searchParams.get(
      "token",
    );
    expect(verifyTeamNotesToken(token ?? "")).toBe("u_on");
  });

  it("writes one audit entry per note sent, with the campaign, reason and text", async () => {
    await send(["u_on", "u_off", "u_es"].map(note));
    const entries = fakeDb.rows("adminAuditLog");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      actorUserId: "u_admin",
      action: "email.personal_note",
      targetType: "user",
      targetId: "u_on",
      metadata: {
        actorEmail: "admin@qrdx.dev",
        targetEmail: "u_on@mail.example.org.uk",
        subjectUserId: "u_on",
        campaign: "warm-check-in",
        reason: "Warm check-ins",
        subject: "Hi Sam",
        body: "Hi Sam,\n\nHow is QRdx working for you?\nTell me.",
        emailId: "em_1",
        via: "console",
      },
    });
    expect(entries[1]?.targetId).toBe("u_es");
  });

  it("never sends twice in a campaign: a second batch skips who got one", async () => {
    await send([note("u_on")]);
    expect(await send(["u_on", "u_es"].map(note))).toEqual([
      { userId: "u_on", status: "skipped", reason: "already_sent" },
      { userId: "u_es", status: "sent", id: "em_1" },
    ]);
    expect(state.sent).toHaveLength(2);
    // Another campaign is another note.
    expect(await send([note("u_on")], "second-check-in")).toEqual([
      { userId: "u_on", status: "sent", id: "em_1" },
    ]);
  });

  it("reports a failed send, writes no entry for it and goes on", async () => {
    state.sendResult = { sent: false, reason: "failed", error: "boom" };
    expect(await send(["u_on", "u_es"].map(note))).toEqual([
      { userId: "u_on", status: "skipped", reason: "failed" },
      { userId: "u_es", status: "skipped", reason: "failed" },
    ]);
    expect(state.sent).toHaveLength(2);
    expect(fakeDb.rows("adminAuditLog")).toHaveLength(0);
  });

  it("waits between sends, not before the first or for skips", async () => {
    vi.useFakeTimers();
    try {
      const pending = sendPersonalNotes(
        {
          template: "personal-note",
          campaign: "warm-check-in",
          reason: "Warm check-ins",
          messages: ["u_on", "u_off", "u_es"].map(note),
        },
        { actor: ACTOR, sender: SENDER, spacingMs: 200 },
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(state.sent).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(199);
      expect(state.sent).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(state.sent).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the note", () => {
  const html = async (userId: string, body: string) =>
    previewPersonalNote(
      { template: "personal-note", userId, subject: "Hi {first_name}", body },
      SENDER,
    );

  it("reads like a personal email: the text, then why, who replies reach and how to stop", async () => {
    const preview = await html(
      "u_on",
      "Hi {first_name},\n\nYour code got 24 scans.\nWhat is it for?\n\nRitesh",
    );
    expect(preview.subject).toBe("Hi Sam");
    expect(preview.skip).toBeNull();
    expect(preview.text).toContain("Hi Sam,");
    expect(preview.text).toContain(
      "This email was meant for u_on@mail.example.org.uk. You're getting this because you have a QRdx account.",
    );
    expect(preview.text).toContain(
      "Reply to this email and it reaches Ritesh from QRdx.",
    );
    expect(preview.html).toContain("Stop notes from the QRdx team");
    expect(preview.html).toContain(
      "Your code got 24 scans.<br/>What is it for?",
    );
    // The inbox preview starts with the text, not just its first line.
    expect(preview.html).toContain(
      "Hi Sam, Your code got 24 scans. What is it for? Ritesh",
    );
    // Signed by hand, so not signed again.
    expect(preview.html).not.toContain(">Ritesh from QRdx</p>");
    // No logo, card or buttons.
    expect(preview.html).not.toContain(">QR<");
    expect(preview.html).not.toContain("<img");
    expect(preview.html).not.toContain("border-radius");
    expect(preview.html).not.toContain("border-top:3px solid");
    const stop = /href="([^"]*unsubscribe[^"]*)"/.exec(preview.html)?.[1];
    const token = new URL(
      stop?.replaceAll("&amp;", "&") ?? "",
    ).searchParams.get("token");
    expect(verifyTeamNotesToken(token ?? "")).toBe("u_on");
  });

  it("puts the footer in the person's language, the text as written", async () => {
    const preview = await html("u_es", "Hola {first_name}");
    expect(preview.text).toContain("Hola Ana");
    // The footer is in the reader's language; the text is the writer's.
    expect(preview.html).toContain('<div lang="es"');
    expect(preview.html).not.toMatch(/<html[^>]*lang="es"/);
    expect(preview.text).not.toContain("you have a QRdx account");
  });

  it("says why a note wouldn't go out, and 404s for an unknown account", async () => {
    expect((await html("u_off", "Hi")).skip).toBe("opted_out");
    expect((await html("u_banned", "Hi")).skip).toBe("banned");
    expect((await html("u_test", "Hi")).skip).toBe("reserved_address");
    await expect(html("u_gone", "Hi")).rejects.toMatchObject({ status: 404 });
  });

  it("escapes what the admin writes", async () => {
    const preview = await html("u_on", "<b>hi</b> & <script>x</script>");
    expect(preview.html).not.toContain("<script>x");
    expect(preview.html).toContain("&lt;b&gt;hi&lt;/b&gt;");
  });

  it("fills {first_name} with the first word of a real name, else 'there', and says which", async () => {
    expect(greetingName("Sam Lee", "sam@x.org")).toEqual({
      name: "Sam",
      fallback: false,
    });
    for (const [name, email] of [
      ["  ", "a@x.org"],
      ["info", "info@x.org"],
      ["JDoe", "jdoe@x.org"],
      ["jdoe1987", "other@x.org"],
      ["sam.lee", "s@x.org"],
      ["sam_lee", "s@x.org"],
      ["\u0007", "s@x.org"],
    ]) {
      expect(greetingName(name as string, email as string), name).toEqual({
        name: "there",
        fallback: true,
      });
    }
    // Control characters count as spaces, so none reach a subject.
    for (const name of ["Sam\u0000", "Sam\u0000Lee", "\u001bSam"]) {
      expect(greetingName(name, "s@x.org"), name).toEqual({
        name: "Sam",
        fallback: false,
      });
    }
    expect((await html("u_ctrl", "Hi {first_name}")).subject).toBe("Hi Sam");
    const info = await html("u_info", "Hi {first_name}");
    expect(info.text).toContain("Hi there");
    expect(info.greeting).toEqual({ name: "there", fallback: true });
    expect((await html("u_on", "Hi")).greeting).toEqual({
      name: "Sam",
      fallback: false,
    });
  });

  it("never reads $ in a name as a replacement pattern", () => {
    expect(
      fillNote("Hi {first_name}!", { name: "$`$`$`$`", fallback: false }),
    ).toBe("Hi $`$`$`$`!");
    expect(fillNote("{first_name} $&", { name: "$&", fallback: false })).toBe(
      "$& $&",
    );
  });

  it("checks the subject's length after {first_name} is filled in, per person", async () => {
    const subject = `${"x".repeat(175)} {first_name}`;
    await expect(
      previewPersonalNote(
        { template: "personal-note", userId: "u_long", subject, body: "Hi" },
        SENDER,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      await sendPersonalNotes(
        {
          template: "personal-note",
          campaign: "warm-check-in",
          reason: "Warm check-ins",
          messages: ["u_long", "u_on"].map((userId) => ({
            userId,
            subject,
            body: "Hi",
          })),
        },
        { actor: ACTOR, sender: SENDER, spacingMs: 0 },
      ),
    ).toEqual([
      { userId: "u_long", status: "skipped", reason: "too_long" },
      { userId: "u_on", status: "sent", id: "em_1" },
    ]);
    expect(state.sent.map((email) => email.to)).toEqual([
      "u_on@mail.example.org.uk",
    ]);
    // Only the note that could go out counted against the budget.
    expect(state.used.get("u_admin")).toBe(1);
  });

  it("splits paragraphs at blank lines and keeps line breaks", () => {
    expect(noteParagraphs("a\r\nb\n \nc\n\n\n\nd  ")).toEqual([
      ["a", "b"],
      ["c"],
      ["d"],
    ]);
    expect(noteParagraphs("\n\n  \n")).toEqual([]);
  });

  it("is signed with the writer's name unless it already ends with it", async () => {
    const unsigned = await html("u_on", "Hi {first_name},\n\nHow is it going?");
    expect(unsigned.text).toMatch(
      /How is it going\?\s+Ritesh from QRdx\s+-{10}/,
    );
    const signs = (body: string, name = "Ritesh from QRdx") =>
      needsSignature(noteParagraphs(body), name);
    expect(signs("Hi Sam,\n\nHow is it going?")).toBe(true);
    expect(signs("Hi Sam,\n\nThanks for writing back.")).toBe(true);
    for (const signed of [
      "Hi Sam,\n\nHow is it going?\n\nRitesh",
      "Hi Sam,\n\nHow is it going?\n\n— Ritesh.",
      "Hi Sam,\n\nHow is it going?\nThanks, ritesh",
      "Hi Sam,\n\nHow is it going?\n\nRitesh from QRdx",
    ]) {
      expect(signs(signed)).toBe(false);
    }
    // A sender with only an address doesn't sign.
    expect(signs("Hi Sam", "support@qrdx.dev")).toBe(false);
  });
});

describe("the sender", () => {
  it("splits EMAIL_FROM_PERSONAL into its name and address", () => {
    expect(parseSender("Ritesh from QRdx <support@qrdx.dev>")).toEqual({
      from: "Ritesh from QRdx <support@qrdx.dev>",
      name: "Ritesh from QRdx",
      address: "support@qrdx.dev",
    });
    expect(parseSender('"Ritesh" <r@qrdx.dev>')).toMatchObject({
      name: "Ritesh",
      address: "r@qrdx.dev",
    });
    expect(parseSender("support@qrdx.dev")).toEqual({
      from: "support@qrdx.dev",
      name: "support@qrdx.dev",
      address: "support@qrdx.dev",
    });
  });
});

describe("the stop link's token", () => {
  it("names the user, and neither kind of token passes for the other", () => {
    const notes = createTeamNotesToken("u_on");
    expect(verifyTeamNotesToken(notes)).toBe("u_on");
    expect(verifyUnsubscribeToken(notes)).toBeNull();
    const alerts = createUnsubscribeToken("setting_1", "all");
    expect(verifyTeamNotesToken(alerts)).toBeNull();
    expect(verifyUnsubscribeToken(alerts)).toEqual({
      settingId: "setting_1",
      event: "all",
    });
    const [payload, signature] = notes.split(".");
    expect(verifyTeamNotesToken(`${payload}.${signature}x`)).toBeNull();
    expect(
      verifyTeamNotesToken(
        `${Buffer.from("u_other:team-notes").toString("base64url")}.${signature}`,
      ),
    ).toBeNull();
  });
});

describe("limits on sending", () => {
  it("keeps to the admin's hourly budget, counting only who it would send to", async () => {
    state.budget = 2;
    expect(await send(["u_on", "u_off", "u_es"].map(note))).toHaveLength(3);
    await expect(
      send([note("u_ban_over")], "another-one"),
    ).rejects.toMatchObject({ status: 429, message: "note_budget_exceeded" });
    expect(state.sent).toHaveLength(2);
  });

  it("counts nothing for a batch it refuses, so the admin isn't held off longer", async () => {
    state.budget = 3;
    await send(["u_on", "u_es"].map(note));
    expect(state.used.get("u_admin")).toBe(2);
    // Two more don't fit in the one left: refused, and not counted.
    await expect(
      send(["u_on", "u_es"].map(note), "second-round"),
    ).rejects.toMatchObject({
      status: 429,
      message: "note_budget_exceeded",
      headers: { "Retry-After": expect.stringMatching(/^\d+$/) },
    });
    expect(state.used.get("u_admin")).toBe(2);
    // The one that's left still goes.
    expect(await send([note("u_on")], "second-round")).toEqual([
      { userId: "u_on", status: "sent", id: "em_1" },
    ]);
    expect(state.used.get("u_admin")).toBe(3);
  });

  it("gives the budget back for notes that didn't go out", async () => {
    state.sendResult = { sent: false, reason: "failed", error: "down" };
    expect(await send(["u_on", "u_es"].map(note))).toEqual([
      { userId: "u_on", status: "skipped", reason: "failed" },
      { userId: "u_es", status: "skipped", reason: "failed" },
    ]);
    expect(state.used.get("u_admin")).toBe(0);

    state.sendResult = { sent: true, id: "em_1" };
    state.auditFails = true;
    await send(["u_on", "u_es", "u_ban_over"].map(note), "another-one");
    // One sent (its entry failed), two not attempted.
    expect(state.used.get("u_admin")).toBe(1);
  });

  it("returns the results when the lock can't be freed, and logs it", async () => {
    state.lockReleaseFails = true;
    expect(await send([note("u_on")])).toEqual([
      { userId: "u_on", status: "sent", id: "em_1" },
    ]);
    const logged = vi
      .mocked(console.error)
      .mock.calls.map(([line]) => String(line));
    expect(logged).toContain(
      JSON.stringify({ event: "personal_note.lock_release_failed" }),
    );
  });

  it("runs one batch at a time: busy while another holds the lock, free after", async () => {
    state.store.set("qrdx:personal-notes:lock", "other-batch");
    await expect(send([note("u_on")])).rejects.toMatchObject({
      status: 409,
      message: "busy",
    });
    state.store.clear();
    await send([note("u_on")]);
    expect(state.store.size).toBe(0);
  });

  it("stops at its time budget and marks the rest not attempted", async () => {
    let clock = 0;
    const results = await sendPersonalNotes(
      {
        template: "personal-note",
        campaign: "warm-check-in",
        reason: "Warm check-ins",
        messages: ["u_on", "u_es", "u_ban_over"].map(note),
      },
      {
        actor: ACTOR,
        sender: SENDER,
        spacingMs: 0,
        timeBudgetMs: 45_000,
        now: () => {
          const at = clock;
          clock += 30_000;
          return at;
        },
      },
    );
    expect(results).toEqual([
      { userId: "u_on", status: "sent", id: "em_1" },
      { userId: "u_es", status: "skipped", reason: "not_attempted" },
      { userId: "u_ban_over", status: "skipped", reason: "not_attempted" },
    ]);
  });

  it("reports a sent note whose audit entry failed, and sends no more", async () => {
    state.auditFails = true;
    expect(await send(["u_on", "u_es"].map(note))).toEqual([
      { userId: "u_on", status: "sent", id: "em_1", auditFailed: true },
      { userId: "u_es", status: "skipped", reason: "not_attempted" },
    ]);
    expect(state.sent).toHaveLength(1);
    const logged = vi
      .mocked(console.error)
      .mock.calls.map(([line]) => String(line))
      .find((line) => line.includes("personal_note.audit_failed"));
    expect(JSON.parse(logged ?? "{}")).toMatchObject({
      userId: "u_on",
      emailId: "em_1",
    });
    expect(logged).not.toContain("@");
  });

  it("calls a note Resend is still sending 'in progress', not failed", async () => {
    state.sendResult = {
      sent: false,
      reason: "failed",
      error: "concurrent",
      code: "concurrent_idempotent_requests",
    };
    expect(await send([note("u_on")])).toEqual([
      { userId: "u_on", status: "skipped", reason: "in_progress" },
    ]);
  });
});
