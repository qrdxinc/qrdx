import "server-only";

import { adminAuditLog, database as db, user } from "@repo/database";
import { renderEmail } from "@repo/email/render";
import { isReservedEmailAddress } from "@repo/email/reserved-address";
import { PersonalNoteEmail } from "@repo/email/templates/personal-note";
import { DEFAULT_LOCALE, isLocale } from "@repo/i18n/config";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { adminError } from "@/app/(app)/admin/_lib/action-runner";
import { writeAuditLog } from "@/app/(app)/admin/_lib/audit";
import { adminId, requiredReason } from "@/app/(app)/admin/_lib/rules";
import { teamNotesUnsubscribeUrl } from "@/lib/events/unsubscribe";
import { emailIntl } from "@/lib/i18n/email";
import { type PersonalSender, personalSender } from "./personal-sender";
import { isEmailConfigured, sendEmail } from "./send";
import { wantsTeamNotes } from "./team-notes";

// Personal notes: one email a person on the team writes to one person, sent
// from the console through /api/internal/console/emails/* (the console
// itself can't send email). Each goes to one account, looked up here by its
// id (the console never sends addresses), from EMAIL_FROM_PERSONAL with
// replies to the same address, once per campaign: the idempotency key is
// personal-note:<campaign>:<userId>, and a person the admin audit log
// already shows a note to in that campaign is skipped, so a double click,
// a retry or a second batch never sends twice. People who turned notes from
// the team off, banned accounts and reserved test addresses are skipped,
// never errors. Each note sent gets its own audit entry.

export const PERSONAL_NOTE_ACTION = "email.personal_note";

/**
 * Who notes come from, or the console endpoints' 503 while they're off:
 * personal_email_not_configured without EMAIL_FROM_PERSONAL,
 * email_not_configured without Resend (RESEND_API_KEY and EMAIL_FROM).
 */
export function noteSenderOrOff(): PersonalSender | Response {
  const off = (error: string) =>
    NextResponse.json({ ok: false, error }, { status: 503 });
  const sender = personalSender();
  if (!sender) return off("personal_email_not_configured");
  if (!isEmailConfigured) return off("email_not_configured");
  return sender;
}

/**
 * Messages in one send. The whole signed request must stay under the
 * console endpoints' 64 KB body limit (413 too_large past it): 25 notes of
 * up to 2,000 characters fit in English; long notes in a script that takes
 * more bytes per character go in smaller batches.
 */
export const MAX_NOTES_PER_SEND = 25;

/**
 * Between two sends, in milliseconds. Resend allows 10 requests a second
 * per team (every email QRdx sends shares it), so a batch takes at most
 * half of that; its batch endpoint isn't used because its idempotency key
 * covers a whole request, not each email.
 */
export const NOTE_SPACING_MS = 200;

/** "{first_name}" in a subject or body becomes the person's first name. */
export const FIRST_NAME_TOKEN = "{first_name}";

export const noteSubject = z
  .string()
  .trim()
  .min(1, "Add a subject.")
  .max(200, "Keep the subject under 200 characters.");
export const noteBody = z
  .string()
  .trim()
  .min(1, "Write the note.")
  .max(2000, "Keep the note under 2,000 characters.");
const campaign = z
  .string()
  .regex(
    /^[a-z0-9-]{3,40}$/,
    "The campaign is 3 to 40 lower-case letters, digits and hyphens.",
  );

export const previewNoteSchema = z.object({
  template: z.literal("personal-note"),
  userId: adminId,
  subject: noteSubject,
  body: noteBody,
});

export const sendNotesSchema = z.object({
  template: z.literal("personal-note"),
  campaign,
  reason: requiredReason,
  messages: z
    .array(z.object({ userId: adminId, subject: noteSubject, body: noteBody }))
    .min(1, "Add at least one recipient.")
    .max(MAX_NOTES_PER_SEND, `At most ${MAX_NOTES_PER_SEND} notes at a time.`)
    .refine(
      (messages) =>
        new Set(messages.map((message) => message.userId)).size ===
        messages.length,
      "Each person can get one note per send.",
    ),
});

/** Why a note wasn't sent. */
export type NoteSkipReason =
  | "opted_out"
  | "banned"
  | "reserved_address"
  | "not_found"
  | "already_sent"
  | "failed";

export type NoteResult =
  | { userId: string; status: "sent"; id: string }
  | { userId: string; status: "skipped"; reason: NoteSkipReason };

interface Recipient {
  id: string;
  name: string;
  email: string;
  banned: boolean | null;
  banExpires: Date | null;
  locale: string | null;
  teamNotes: boolean | null;
}

async function loadRecipients(ids: string[]): Promise<Map<string, Recipient>> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      banned: user.banned,
      banExpires: user.banExpires,
      locale: user.locale,
      teamNotes: user.teamNotes,
    })
    .from(user)
    .where(inArray(user.id, ids));
  return new Map(rows.map((row) => [row.id, row]));
}

/** Banned now: a ban that has expired no longer counts (Better Auth's rule). */
const isBanned = (recipient: Recipient, now: Date) =>
  Boolean(recipient.banned) &&
  (!recipient.banExpires || recipient.banExpires > now);

/** Why this person gets no note, or null. */
function skipReason(
  recipient: Recipient,
  now: Date,
): Exclude<NoteSkipReason, "not_found" | "already_sent" | "failed"> | null {
  if (isBanned(recipient, now)) return "banned";
  if (isReservedEmailAddress(recipient.email)) return "reserved_address";
  if (!wantsTeamNotes(recipient)) return "opted_out";
  return null;
}

/** The first word of the account's name; "there" without one ("Hi there"). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}

/** The subject or body with {first_name} filled in. */
export const fillNote = (text: string, recipient: { name: string }) =>
  text.replaceAll(FIRST_NAME_TOKEN, firstName(recipient.name));

async function noteEmail(
  recipient: Recipient,
  { subject, body }: { subject: string; body: string },
  sender: PersonalSender,
) {
  const intl = await emailIntl(
    isLocale(recipient.locale) ? recipient.locale : DEFAULT_LOCALE,
  );
  const unsubscribeUrl = teamNotesUnsubscribeUrl(recipient.id);
  const filledBody = fillNote(body, recipient);
  return {
    subject: fillNote(subject, recipient),
    body: filledBody,
    unsubscribeUrl,
    react: (
      <PersonalNoteEmail
        body={filledBody}
        intl={intl}
        senderName={sender.name}
        unsubscribeUrl={unsubscribeUrl}
      />
    ),
  };
}

/**
 * The note as this person would get it, and why it wouldn't go out
 * (`skip`), for the console's preview. 404 for an unknown account.
 */
export async function previewPersonalNote(
  input: z.output<typeof previewNoteSchema>,
  sender: PersonalSender,
): Promise<{
  subject: string;
  html: string;
  text: string;
  skip: NoteSkipReason | null;
}> {
  const recipient = (await loadRecipients([input.userId])).get(input.userId);
  if (!recipient) throw adminError("User not found", 404);
  const note = await noteEmail(recipient, input, sender);
  const { html, text } = await renderEmail(note.react);
  return {
    subject: note.subject,
    html,
    text,
    skip: skipReason(recipient, new Date()),
  };
}

/** People the audit log shows a note to in this campaign already. */
async function notedInCampaign(
  name: string,
  ids: string[],
): Promise<Set<string>> {
  const rows = await db
    .select({
      targetId: adminAuditLog.targetId,
      metadata: adminAuditLog.metadata,
    })
    .from(adminAuditLog)
    .where(
      and(
        eq(adminAuditLog.action, PERSONAL_NOTE_ACTION),
        eq(adminAuditLog.targetType, "user"),
        inArray(adminAuditLog.targetId, ids),
      ),
    );
  return new Set(
    rows
      .filter((row) => row.metadata?.campaign === name)
      .map((row) => row.targetId as string),
  );
}

const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sends each message to its person, one at a time, NOTE_SPACING_MS apart,
 * and answers what happened to each, in order. A failed send is reported
 * and the rest still go; an audit entry that can't be written stops the
 * batch (no more email without a record).
 */
export async function sendPersonalNotes(
  { campaign: name, reason, messages }: z.output<typeof sendNotesSchema>,
  {
    actor,
    sender,
    spacingMs = NOTE_SPACING_MS,
  }: {
    actor: { id: string; email: string };
    sender: PersonalSender;
    spacingMs?: number;
  },
): Promise<NoteResult[]> {
  const ids = messages.map((message) => message.userId);
  const [recipients, noted] = await Promise.all([
    loadRecipients(ids),
    notedInCampaign(name, ids),
  ]);
  const now = new Date();
  const results: NoteResult[] = [];
  let sent = 0;
  for (const message of messages) {
    const { userId } = message;
    const recipient = recipients.get(userId);
    const skip = recipient
      ? noted.has(userId)
        ? "already_sent"
        : skipReason(recipient, now)
      : "not_found";
    if (!recipient || skip) {
      results.push({ userId, status: "skipped", reason: skip ?? "not_found" });
      continue;
    }
    if (sent > 0) await pause(spacingMs);
    sent += 1;
    const note = await noteEmail(recipient, message, sender);
    const result = await sendEmail({
      to: recipient.email,
      from: sender.from,
      replyTo: sender.address,
      subject: note.subject,
      react: note.react,
      unsubscribeUrl: note.unsubscribeUrl,
      idempotencyKey: `personal-note:${name}:${userId}`,
      tags: [
        { name: "kind", value: "personal-note" },
        { name: "campaign", value: name },
      ],
    });
    if (!result.sent) {
      results.push({ userId, status: "skipped", reason: "failed" });
      continue;
    }
    await writeAuditLog({
      actor,
      action: PERSONAL_NOTE_ACTION,
      targetType: "user",
      targetId: userId,
      metadata: {
        targetEmail: recipient.email,
        subjectUserId: userId,
        campaign: name,
        reason,
        subject: note.subject,
        body: note.body,
        emailId: result.id,
        via: "console",
      },
    });
    results.push({ userId, status: "sent", id: result.id });
  }
  return results;
}
