import { consoleInternalRoute } from "@/lib/console-internal/route";
import {
  noteSenderOrOff,
  previewNoteSchema,
  previewPersonalNote,
} from "@/lib/email/personal-notes";

// POST from the back-office console: a personal note as one person would get
// it (subject, HTML and text, {first_name} filled in), and why it wouldn't go
// out (`skip`: opted_out, banned, reserved_address), without sending
// anything. 503 while notes are off (personal_email_not_configured without
// EMAIL_FROM_PERSONAL, email_not_configured without Resend). Signed, with
// the admin checked again here (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";

export const POST = consoleInternalRoute({
  schema: previewNoteSchema,
  run: async (input) => {
    const sender = noteSenderOrOff();
    if (sender instanceof Response) return sender;
    return { data: await previewPersonalNote(input, sender) };
  },
});
