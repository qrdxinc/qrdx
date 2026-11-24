import { render } from "@react-email/render";
import type { ReactElement } from "react";

/**
 * The plain-text body's rules on top of React Email's: a link marked
 * data-text-only prints its text alone, as when its text already is the
 * address (the footer's "QRdx · qrdx.dev"), not "qrdx.dev https://qrdx.dev".
 */
const PLAIN_TEXT_OPTIONS = {
  selectors: [
    {
      selector: "a[data-text-only]",
      format: "anchor",
      options: { ignoreHref: true },
    },
  ],
};

/** HTML and plain-text bodies of a template. */
export async function renderEmail(
  react: ReactElement
): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([
    render(react),
    render(react, { plainText: true, htmlToTextOptions: PLAIN_TEXT_OPTIONS }),
  ]);
  return { html, text };
}
