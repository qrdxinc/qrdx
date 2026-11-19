import { consoleInternalRoute } from "@/lib/console-internal/route";
import {
  noteSenderOrOff,
  PERSONAL_NOTE_ACTION,
  sendNotesSchema,
  sendPersonalNotes,
} from "@/lib/email/personal-notes";

// POST from the back-office console: sends personal notes, 1 to 25 at a
// time, one email per person (lib/email/personal-notes.tsx), and answers
// what happened to each: { results: [{ userId, status: "sent", id } |
// { userId, status: "skipped", reason }] }. Strong confirmation when it
// goes to more than one person; the admin pages' standard limit (30 calls a
// minute per admin), and at most 60 notes an hour per admin (429
// note_budget_exceeded, with Retry-After and `retryAfter` seconds) with one
// batch at a time (409 busy). Each note sent gets its own audit entry
// (email.personal_note), so the call writes none of its own. 503 while
// notes are off (personal_email_not_configured without EMAIL_FROM_PERSONAL,
// email_not_configured without Resend). Signed, with the admin checked
// again here (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";
// 25 notes, 200 ms apart, each rendered and sent: well under a minute.
export const maxDuration = 60;

export const POST = consoleInternalRoute({
  action: PERSONAL_NOTE_ACTION,
  schema: sendNotesSchema,
  strong: (input) => input.messages.length > 1,
  run: async (input, { actor }) => {
    const sender = noteSenderOrOff();
    if (sender instanceof Response) return sender;
    return {
      audit: null,
      data: { results: await sendPersonalNotes(input, { actor, sender }) },
    };
  },
});
