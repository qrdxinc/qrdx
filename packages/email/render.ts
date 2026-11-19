import { render } from "@react-email/render";
import type { ReactElement } from "react";

/** HTML and plain-text bodies of a template. */
export async function renderEmail(
  react: ReactElement
): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([
    render(react),
    render(react, { plainText: true }),
  ]);
  return { html, text };
}
