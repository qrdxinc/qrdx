import "server-only";

import { adminAuditLog, database as db, user } from "@repo/database";
import { renderEmail } from "@repo/email/render";
import { isReservedEmailAddress } from "@repo/email/reserved-address";
import { PersonalNoteEmail } from "@repo/email/templates/personal-note";
import { DEFAULT_LOCALE, isLocale } from "@repo/i18n/config";
import {
  createRateLimiter,
  RateLimitUnavailableError,
  redis,
  slidingWindow,
} from "@repo/rate-limit";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { adminError } from "@/app/(app)/admin/_lib/action-runner";
import { writeAuditLog } from "@/app/(app)/admin/_lib/audit";
import { adminId, requiredReason } from "@/app/(app)/admin/_lib/rules";
import { teamNotesUnsubscribeUrl } from "@/lib/events/unsubscribe";
import { HttpError } from "@/lib/http-error";
import { emailIntl } from "@/lib/i18n/email";
import { enforceRateLimits } from "@/lib/request-guards";
import { type Greeting, greetingName } from "./greeting";
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
 * per team (ratelimit-policy: 10;w=1), shared with every email QRdx sends,
 * sign-in codes included, which don't retry. Notes take at most 4 a second,
 * and only one batch runs at a time (NOTE_LOCK). Its batch endpoint isn't
 * used because its idempotency key covers a whole request, not each email.
 */
export const NOTE_SPACING_MS = 250;

/** Notes each admin may send an hour, across calls (Redis). */
export const NOTES_PER_HOUR = 60;

/** A batch stops sending past this (the route's maxDuration is 60 s). */
export const NOTE_TIME_BUDGET_MS = 45_000;

/** "{first_name}" in a subject or body becomes the person's first name. */
export const FIRST_NAME_TOKEN = "{first_name}";

const SUBJECT_MAX = 200;
// No line breaks or other control characters: a subject is one header line.
const ONE_LINE = /^\P{Cc}*$/u;

export const noteSubject = z
  .string()
  .trim()
  .min(1, "Add a subject.")
  .max(SUBJECT_MAX, "Keep the subject under 200 characters.")
  .regex(ONE_LINE, "Keep the subject on one line.");
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
  // Resend is still handling the same note (an overlapping request)
  | "in_progress"
  // The batch stopped first (its time budget, or an audit write failed)
  | "not_attempted"
  | "failed";

export type NoteResult =
  | {
      userId: string;
      status: "sent";
      id: string;
      /** The note went out, but its audit entry couldn't be written */
      auditFailed?: true;
    }
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
): "banned" | "reserved_address" | "opted_out" | null {
  if (isBanned(recipient, now)) return "banned";
  if (isReservedEmailAddress(recipient.email)) return "reserved_address";
  if (!wantsTeamNotes(recipient)) return "opted_out";
  return null;
}

/** The subject or body with {first_name} filled in ("there" for a handle). */
export const fillNote = (text: string, greeting: Greeting) =>
  // A function, so "$&" or "$`" in a name is never a replacement pattern.
  text.replaceAll(FIRST_NAME_TOKEN, () => greeting.name);

function noteText(
  recipient: Recipient,
  { subject, body }: { subject: string; body: string },
) {
  const greeting = greetingName(recipient.name, recipient.email);
  return {
    greeting,
    subject: fillNote(subject, greeting),
    body: fillNote(body, greeting),
  };
}

const subjectTooLong = () =>
  adminError(
    "With {first_name} filled in, a subject is over 200 characters.",
    400,
  );

async function noteEmail(
  recipient: Recipient,
  text: { subject: string; body: string },
  sender: PersonalSender,
) {
  const intl = await emailIntl(
    isLocale(recipient.locale) ? recipient.locale : DEFAULT_LOCALE,
  );
  const unsubscribeUrl = teamNotesUnsubscribeUrl(recipient.id);
  return {
    unsubscribeUrl,
    react: (
      <PersonalNoteEmail
        body={text.body}
        intl={intl}
        senderName={sender.name}
        unsubscribeUrl={unsubscribeUrl}
      />
    ),
  };
}

/**
 * The note as this person would get it, who it greets (`greeting.fallback`:
 * "there", because the name is the address's local part or a handle), and
 * why it wouldn't go out (`skip`), for the console's preview. 404 for an
 * unknown account.
 */
export async function previewPersonalNote(
  input: z.output<typeof previewNoteSchema>,
  sender: PersonalSender,
): Promise<{
  subject: string;
  html: string;
  text: string;
  greeting: Greeting;
  skip: NoteSkipReason | null;
}> {
  const recipient = (await loadRecipients([input.userId])).get(input.userId);
  if (!recipient) throw adminError("User not found", 404);
  const text = noteText(recipient, input);
  if (text.subject.length > SUBJECT_MAX) throw subjectTooLong();
  const note = await noteEmail(recipient, text, sender);
  const { html, text: plain } = await renderEmail(note.react);
  return {
    subject: text.subject,
    html,
    text: plain,
    greeting: text.greeting,
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

const noteBudget = createRateLimiter({
  limiter: slidingWindow(NOTES_PER_HOUR, "1 h"),
  prefix: "qrdx:personal-notes",
  failClosed: true,
});

/** One send batch at a time across the deployment. */
const NOTE_LOCK = "qrdx:personal-notes:lock";
const NOTE_LOCK_SECONDS = 90;

/**
 * Runs `work` holding the batch lock; 409 `busy` while another batch holds
 * it, 503 without Redis (the console endpoints need it anyway).
 */
async function withNoteLock<T>(work: () => Promise<T>): Promise<T> {
  if (!redis) throw new RateLimitUnavailableError("Upstash isn't configured");
  const token = crypto.randomUUID();
  const taken = await redis.set(NOTE_LOCK, token, {
    nx: true,
    ex: NOTE_LOCK_SECONDS,
  });
  if (taken !== "OK") throw new HttpError(409, "NOTE_BUSY", "busy");
  try {
    return await work();
  } finally {
    // Only our own lock: a batch that outlived it doesn't free the next one's.
    if ((await redis.get(NOTE_LOCK)) === token) await redis.del(NOTE_LOCK);
  }
}

/**
 * Sends each message to its person, one at a time, NOTE_SPACING_MS apart,
 * one batch at a time (409 `busy`), within the admin's hourly budget (429
 * `note_budget_exceeded`, counted for the people it would actually send
 * to), and answers what happened to each, in order. A failed send is
 * reported and the rest still go. Past NOTE_TIME_BUDGET_MS, or after an
 * audit entry can't be written (no more email without a record), the rest
 * are `not_attempted`.
 */
export async function sendPersonalNotes(
  { campaign: name, reason, messages }: z.output<typeof sendNotesSchema>,
  {
    actor,
    sender,
    spacingMs = NOTE_SPACING_MS,
    timeBudgetMs = NOTE_TIME_BUDGET_MS,
    now = () => Date.now(),
  }: {
    actor: { id: string; email: string };
    sender: PersonalSender;
    spacingMs?: number;
    timeBudgetMs?: number;
    now?: () => number;
  },
): Promise<NoteResult[]> {
  return withNoteLock(async () => {
    const started = now();
    const ids = messages.map((message) => message.userId);
    const [recipients, noted] = await Promise.all([
      loadRecipients(ids),
      notedInCampaign(name, ids),
    ]);
    const today = new Date(started);
    const plan = messages.map((message) => {
      const recipient = recipients.get(message.userId);
      if (!recipient) return { message, skip: "not_found" as const };
      if (noted.has(message.userId)) {
        return { message, skip: "already_sent" as const };
      }
      const skip = skipReason(recipient, today);
      if (skip) return { message, skip };
      const text = noteText(recipient, message);
      if (text.subject.length > SUBJECT_MAX) throw subjectTooLong();
      return { message, recipient, text, skip: null };
    });
    const sendable = plan.filter((entry) => entry.skip === null).length;
    if (sendable > 0) {
      try {
        await enforceRateLimits([
          { limiter: noteBudget, key: actor.id, rate: sendable },
        ]);
      } catch (error) {
        if (error instanceof HttpError && error.status === 429) {
          throw new HttpError(
            429,
            "NOTE_BUDGET",
            "note_budget_exceeded",
            error.headers,
          );
        }
        throw error;
      }
    }

    const results: NoteResult[] = [];
    let sent = 0;
    let stopped = false;
    for (const entry of plan) {
      const { userId } = entry.message;
      if (stopped) {
        results.push({ userId, status: "skipped", reason: "not_attempted" });
        continue;
      }
      if (entry.skip !== null || !entry.recipient || !entry.text) {
        results.push({
          userId,
          status: "skipped",
          reason: entry.skip ?? "not_found",
        });
        continue;
      }
      if (now() - started > timeBudgetMs) {
        stopped = true;
        results.push({ userId, status: "skipped", reason: "not_attempted" });
        continue;
      }
      if (sent > 0) await pause(spacingMs);
      sent += 1;
      const { recipient, text } = entry;
      const note = await noteEmail(recipient, text, sender);
      const result = await sendEmail({
        to: recipient.email,
        from: sender.from,
        replyTo: sender.address,
        subject: text.subject,
        react: note.react,
        unsubscribeUrl: note.unsubscribeUrl,
        idempotencyKey: `personal-note:${name}:${userId}`,
        tags: [
          { name: "kind", value: "personal-note" },
          { name: "campaign", value: name },
        ],
      });
      if (!result.sent) {
        // Resend's 409s: the same note is still being sent by an
        // overlapping request, or went out already with other text.
        const why =
          result.code === "concurrent_idempotent_requests"
            ? "in_progress"
            : result.code === "invalid_idempotent_request"
              ? "already_sent"
              : "failed";
        results.push({ userId, status: "skipped", reason: why });
        continue;
      }
      try {
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
            subject: text.subject,
            body: text.body,
            emailId: result.id,
            via: "console",
          },
        });
        results.push({ userId, status: "sent", id: result.id });
      } catch (error) {
        // The note went out: say so, record what we can, and send no more.
        console.error(
          JSON.stringify({
            event: "personal_note.audit_failed",
            userId,
            emailId: result.id,
            campaign: name,
            error: error instanceof Error ? error.name : "unknown",
          }),
        );
        results.push({
          userId,
          status: "sent",
          id: result.id,
          auditFailed: true,
        });
        stopped = true;
      }
    }
    return results;
  });
}
