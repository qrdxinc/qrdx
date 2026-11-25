// "Where did you first hear about QRdx?": an optional one-tap question on
// Home in an account's first weeks (owner decision, 25 Nov 2026). The
// channel recorded at sign-up (lib/analytics/acquisition.ts) only sees the
// visit the account was made in, so a return visit reads "direct" and a
// browser sending Do Not Track leaves no record at all; the person's own
// answer fills that in. It's asked once, never blocks anything, and is
// stored on user_acquisition (self_reported, self_reported_text) by
// actions/where-heard.ts. Pure and client-safe.

/** The answers, in the order the card offers them. */
export const WHERE_HEARD_ANSWERS = [
  "ai_assistant",
  "search",
  "friend",
  "x_threads",
  "linkedin",
  "youtube",
  "reddit_hn",
  "product_hunt",
  "directory",
  "other",
] as const;

export type WhereHeardAnswer = (typeof WHERE_HEARD_ANSWERS)[number];

/** Days after signing up in which Home asks. */
export const WHERE_HEARD_ASK_DAYS = 30;

/** The most characters kept of the words typed for "Other". */
export const WHERE_HEARD_TEXT_MAX = 200;

/** user_acquisition.channel for a row that holds only an answer. */
export const NO_TRACKED_CHANNEL = "unknown";

export interface WhereHeard {
  answer: WhereHeardAnswer;
  /** The words typed for "Other", trimmed; null for every other answer */
  text: string | null;
}

const ANSWERS: ReadonlySet<string> = new Set(WHERE_HEARD_ANSWERS);

// Control characters, including line breaks: the text is one line.
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
const CONTROL = /[\u0000-\u001f\u007f-\u009f]+/g;

/** A submitted answer, checked; null when it isn't one of the answers. */
export function parseWhereHeard(
  answer: unknown,
  text: unknown,
): WhereHeard | null {
  if (typeof answer !== "string" || !ANSWERS.has(answer)) return null;
  const typed =
    answer === "other" && typeof text === "string"
      ? text.replace(CONTROL, " ").replace(/\s+/g, " ").trim()
      : "";
  return {
    answer: answer as WhereHeardAnswer,
    text: typed ? [...typed].slice(0, WHERE_HEARD_TEXT_MAX).join("") : null,
  };
}

/**
 * Whether Home asks: an account at most WHERE_HEARD_ASK_DAYS old that hasn't
 * answered. (Dismissing it is remembered with the spotlights, in the card.)
 */
export function asksWhereHeard({
  createdAt,
  answered,
  now = new Date(),
}: {
  createdAt: Date;
  answered: boolean;
  now?: Date;
}): boolean {
  if (answered) return false;
  const age = now.getTime() - createdAt.getTime();
  return age >= 0 && age <= WHERE_HEARD_ASK_DAYS * 24 * 60 * 60 * 1000;
}
