import { Fragment } from "react";
import type { EmailIntl } from "../intl";
import { PersonalLayout, PersonalText } from "./personal-layout";

// A note a person on the team writes to one person, sent from the console
// (apps/app/lib/email/personal-notes.tsx): their text, as they wrote it.

export interface PersonalNoteEmailProps {
  /** Plain text; a blank line starts a new paragraph */
  body: string;
  /** Who wrote it and whom a reply reaches, e.g. "Ritesh from QRdx" */
  senderName: string;
  /** Turns notes from the team off in one click */
  unsubscribeUrl: string;
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

/** The inbox preview line: the start of the text, on one line. */
const notePreview = (paragraphs: string[][]) => {
  const text = paragraphs.map((lines) => lines.join(" ")).join(" ");
  return text.length > 150 ? `${text.slice(0, 149).trimEnd()}…` : text;
};

export function PersonalNoteEmail({
  body,
  senderName,
  unsubscribeUrl,
  intl,
}: PersonalNoteEmailProps) {
  const paragraphs = noteParagraphs(body);
  return (
    <PersonalLayout
      intl={intl}
      preview={notePreview(paragraphs)}
      reason={intl.t("personalNote.reason")}
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
    </PersonalLayout>
  );
}

/** What the preview app (apps/email) renders. */
PersonalNoteEmail.PreviewProps = {
  body: "Hi Sam,\n\nI saw your Spring menu code got 24 scans this week. Nice! What are you using it for?\n\nIf anything about QRdx got in your way, tell me and I'll fix it.\n\nRitesh",
  senderName: "Ritesh from QRdx",
  unsubscribeUrl: "https://qrdx.dev/api/email/unsubscribe?token=preview.token",
} satisfies Omit<PersonalNoteEmailProps, "intl">;
