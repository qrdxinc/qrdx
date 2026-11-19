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
  sendResult: { sent: true, id: "em_1" } as
    | { sent: true; id: string }
    | { sent: false; reason: "failed"; error: string },
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
vi.mock("@/lib/email/send", () => ({
  isEmailConfigured: true,
  sendEmail: vi.fn(async (options: (typeof state.sent)[number]) => {
    state.sent.push(options);
    return state.sendResult;
  }),
}));

const { noteParagraphs } = await import("@repo/email/templates/personal-note");
const { parseSender } = await import("@/lib/email/personal-sender");
const { firstName, previewPersonalNote, sendPersonalNotes } = await import(
  "@/lib/email/personal-notes"
);
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
      "You're getting this because you have a QRdx account.",
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
    // No wordmark, card or buttons.
    expect(preview.html).not.toContain(">QR<");
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
    expect(preview.html).toContain('lang="es"');
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

  it("fills {first_name} with the first word of the name, else 'there'", async () => {
    expect(firstName("Sam Lee")).toBe("Sam");
    expect(firstName("  ")).toBe("there");
    expect((await html("u_noname", "Hi {first_name}")).text).toContain(
      "Hi there",
    );
  });

  it("splits paragraphs at blank lines and keeps line breaks", () => {
    expect(noteParagraphs("a\r\nb\n \nc\n\n\n\nd  ")).toEqual([
      ["a", "b"],
      ["c"],
      ["d"],
    ]);
    expect(noteParagraphs("\n\n  \n")).toEqual([]);
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
