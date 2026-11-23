import { Fragment } from "react";
import type { EmailIntl } from "../intl";
import { PersonalLayout, PersonalText } from "./personal-layout";

// A note a person on the team writes to one person, sent from the console
// (apps/app/lib/email/personal-notes.tsx): their text, as they wrote it,
// signed with their name unless the text already is.

export interface PersonalNoteEmailProps {
  /** Plain text; a blank line starts a new paragraph */
  body: string;
  /** Who wrote it and whom a reply reaches, e.g. "Ritesh from QRdx" */
  senderName: string;
  /** Turns notes from the team off in one click */
  unsubscribeUrl: string;
  /** The person's address, where this goes */
  recipient?: string;
  /** The recipient's language, for the footer */
  intl: EmailIntl;
}

/** The body's paragraphs (split at blank lines), each one's lines. */
export function noteParagraphs(body: string): string[][] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => paragraph.split("\n").map((line) => line.trim()));
}

/**
 * Whether to sign the note with the writer's name: not when its last line
 * already does ("Ritesh", "— Ritesh", "Thanks, Ritesh", "Ritesh from
 * QRdx"), and not when the sender has no name, only an address.
 */
export function needsSignature(
  paragraphs: string[][],
  senderName: string
): boolean {
  if (senderName.includes("@")) return false;
  const bare = (text: string) =>
    text.replace(/^[\s\-–—~]+|[\s.,!]+$/g, "").toLowerCase();
  const name = bare(senderName);
  const first = name.split(/\s+/)[0] ?? name;
  const last = bare(paragraphs.at(-1)?.at(-1) ?? "");
  return ![name, first].some(
    (signature) => last === signature || last.endsWith(`, ${signature}`)
  );
}

/** The inbox preview line: the start of the text, on one line. */
const notePreview = (paragraphs: string[][]) => {
  const text = paragraphs.map((lines) => lines.join(" ")).join(" ");
  return text.length > 150 ? `${text.slice(0, 149).trimEnd()}…` : text;
};

export function PersonalNoteEmail({
  body,
  senderName,
  unsubscribeUrl,
  recipient,
  intl,
}: PersonalNoteEmailProps) {
  const paragraphs = noteParagraphs(body);
  return (
    <PersonalLayout
      intl={intl}
      preview={notePreview(paragraphs)}
      reason={intl.t("personalNote.reason")}
      recipient={recipient}
      replyTo={senderName}
      unsubscribeUrl={unsubscribeUrl}
    >
      {paragraphs.map((lines, index) => (
        <PersonalText key={index}>
          {lines.map((line, at) => (
            <Fragment key={at}>
              {at > 0 ? <br /> : null}
              {line}
            </Fragment>
          ))}
        </PersonalText>
      ))}
      {needsSignature(paragraphs, senderName) ? (
        <PersonalText>{senderName}</PersonalText>
      ) : null}
    </PersonalLayout>
  );
}

/** What the preview app (apps/email) renders. */
PersonalNoteEmail.PreviewProps = {
  body: "Hi Sam,\n\nI saw your Spring menu code got 24 scans this week. Nice! What are you using it for?\n\nIf anything about QRdx got in your way, tell me and I'll fix it.",
  senderName: "Ritesh from QRdx",
  unsubscribeUrl: "https://qrdx.dev/api/email/unsubscribe?token=preview.token",
  recipient: "sam@example.com",
} satisfies Omit<PersonalNoteEmailProps, "intl">;
