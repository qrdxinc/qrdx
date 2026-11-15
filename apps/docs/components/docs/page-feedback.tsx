"use client";

import { cn } from "@repo/design-system/lib/utils";
import { Edit2, Flag } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { track } from "@/lib/analytics";

const ANSWER_BUTTON =
  "inline-flex h-8 items-center rounded-full border bg-fd-card px-3.5 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring";

const LINK =
  "inline-flex items-center gap-1.5 text-fd-muted-foreground transition-colors hover:text-fd-foreground focus-visible:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-fd-ring [&_svg]:size-4";

/**
 * "Was this page helpful?" at the end of a docs page. No backend: the
 * answer is one analytics event (`docs_feedback`, the page's path and yes
 * or no), then a thank-you line with the links to edit the page's source
 * and to open an issue.
 */
export function PageFeedback({
  path,
  editUrl,
  reportUrl,
}: {
  /** The page's English docs path, what the event records. */
  path: string;
  /** GitHub's editor for the page's source file. */
  editUrl: string;
  /** A new GitHub issue about this page, title and body prefilled. */
  reportUrl: string;
}) {
  const t = useTranslations("docs.shell.feedback");
  const id = useId();
  const [answer, setAnswer] = useState<"yes" | "no" | null>(null);

  const send = (value: "yes" | "no") => {
    // sanitizeProps drops strings over 64 characters; a longer path is
    // still useful cut, and the pageview carries the full URL anyway.
    track("docs_feedback", { path: path.slice(0, 64), answer: value });
    setAnswer(value);
  };

  return (
    <section
      aria-labelledby={id}
      className="not-prose mt-12 flex flex-col gap-4 border-t pt-6 text-sm"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {answer === null ? (
          <>
            <p className="font-medium text-fd-foreground" id={id}>
              {t("question")}
            </p>
            <div className="inline-flex gap-2">
              <button
                aria-describedby={id}
                className={ANSWER_BUTTON}
                onClick={() => send("yes")}
                type="button"
              >
                {t("yes")}
              </button>
              <button
                aria-describedby={id}
                className={ANSWER_BUTTON}
                onClick={() => send("no")}
                type="button"
              >
                {t("no")}
              </button>
            </div>
          </>
        ) : (
          <p className="text-fd-muted-foreground" id={id} role="status">
            {t("thanks")}
          </p>
        )}
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-5 gap-y-2 sm:ms-auto",
          )}
        >
          <a
            className={LINK}
            href={editUrl}
            rel="noreferrer noopener"
            target="_blank"
          >
            <Edit2 aria-hidden />
            {t("edit")}
          </a>
          <a
            className={LINK}
            href={reportUrl}
            rel="noreferrer noopener"
            target="_blank"
          >
            <Flag aria-hidden />
            {t("report")}
          </a>
        </div>
      </div>
    </section>
  );
}
