// The docs shell's own pieces: the Markdown copies of the new MDX blocks
// (components/mdx/frame.tsx, video.tsx, plan-note.tsx and the Shots lane's
// <Shot />), and the GitHub links under a page.

import { describe, expect, it } from "vitest";
import { cleanLlmMarkdown } from "@/lib/agents/llm-markdown";
import { getGitHubIssueUrl, getGithubEditUrl } from "@/lib/github";
import { blankMdxComments, isMdxComment } from "@/lib/mdx-comments";

const origin = "https://qrdx.dev";

describe("Markdown for the docs' media blocks", () => {
  it("turns a framed image into a Markdown image with its caption", () => {
    const md = cleanLlmMarkdown(
      `Before.\n\n<Frame src="/docs-images/editor.png" alt="The editor" caption="The editor, Controls tab" />\n\nAfter.`,
      { origin },
    );
    expect(md).toBe(
      "Before.\n\n![The editor](https://qrdx.dev/docs-images/editor.png)\n\nThe editor, Controls tab\n\nAfter.\n",
    );
  });

  it("treats a Shot like a Frame", () => {
    const md = cleanLlmMarkdown(`<Shot src="/s/x.png" alt="A code" />`, {
      origin,
    });
    expect(md).toBe("![A code](https://qrdx.dev/s/x.png)\n");
  });

  it("keeps what a frame wraps when it has no image", () => {
    const md = cleanLlmMarkdown(
      `<Frame caption="x">\n  Some **text**.\n</Frame>`,
    );
    expect(md).toBe("Some **text**.\n");
  });

  it("turns a clip into a link named after its title", () => {
    const md = cleanLlmMarkdown(
      `<Video src="/clips/routing.mp4" title="Routing a code by country" caption="Settings, then Routing." />`,
      { origin },
    );
    expect(md).toBe(
      "[Routing a code by country](https://qrdx.dev/clips/routing.mp4)\n\nSettings, then Routing.\n",
    );
  });

  it("spells out a plan note", () => {
    expect(cleanLlmMarkdown(`<PlanNote plans="pro,business" />`)).toBe(
      "**Needs Pro or Business**\n",
    );
    expect(
      cleanLlmMarkdown(
        `<PlanNote plans="business">\n  Only owners can turn it on.\n</PlanNote>`,
      ),
    ).toBe("**Needs Business**\n\nOnly owners can turn it on.\n");
  });
});

describe("MDX comments stay out of the Markdown copies", () => {
  it("recognises comment expressions, and only those", () => {
    expect(
      isMdxComment({
        type: "mdxFlowExpression",
        value: "/* shot: a | b | c */",
      }),
    ).toBe(true);
    expect(
      isMdxComment({ type: "mdxTextExpression", value: " /* note */ " }),
    ).toBe(true);
    expect(isMdxComment({ type: "mdxFlowExpression", value: "facts.x" })).toBe(
      false,
    );
    expect(isMdxComment({ type: "paragraph" })).toBe(false);
  });

  it("blanks comments in the source without moving anything else", () => {
    const source = [
      "Para {/* inline note */} text.",
      "",
      "{/* shot: a | b",
      "   | c */}",
      "```tsx",
      "const x = '{/* code stays */}';",
      "```",
      "Code `{/* span stays */}` here.",
    ].join("\n");
    const blanked = blankMdxComments(source);
    expect(blanked.length).toBe(source.length);
    expect(blanked.split("\n").length).toBe(source.split("\n").length);
    expect(blanked).toContain("Para                     text.");
    expect(blanked).not.toContain("shot:");
    expect(blanked).toContain("const x = '{/* code stays */}';");
    expect(blanked).toContain("`{/* span stays */}`");
  });

  it("drops shot, clip and diagram markers and plain notes, lines included", () => {
    const md = cleanLlmMarkdown(
      [
        "Before.",
        "",
        "{/* shot: editor-controls | the Controls tab | /playground */}",
        "",
        "Middle {/* writer's note */} text.",
        "",
        "{/* clip: routing | the rule being added | Settings > Routing */}",
        "```tsx",
        "const kept = '{/* not a comment in code */}';",
        "```",
        "After `{/* inline code is kept */}`.",
      ].join("\n"),
    );
    expect(md).toBe(
      "Before.\n\nMiddle  text.\n\n```tsx\nconst kept = '{/* not a comment in code */}';\n```\nAfter `{/* inline code is kept */}`.\n",
    );
  });
});

describe("GitHub links under a page", () => {
  it("edits the file that rendered, index pages included", () => {
    expect(getGithubEditUrl("help/index.mdx")).toBe(
      "https://github.com/qrdxinc/qrdx/edit/main/apps/docs/content/docs/help/index.mdx",
    );
    expect(getGithubEditUrl("developers/mcp.mdx")).toBe(
      "https://github.com/qrdxinc/qrdx/edit/main/apps/docs/content/docs/developers/mcp.mdx",
    );
    expect(getGithubEditUrl("(guides)/../teams.mdx")).toBe(
      "https://github.com/qrdxinc/qrdx/edit/main/apps/docs/content/docs/(guides)/../teams.mdx",
    );
  });

  it("prefills a problem report", () => {
    const url = new URL(
      getGitHubIssueUrl({
        owner: "qrdxinc",
        repo: "qrdx",
        title: "Docs: Teams",
        body: "Page: https://qrdx.dev/docs/teams\n\nWhat is wrong or missing:\n",
      }),
    );
    expect(url.pathname).toBe("/qrdxinc/qrdx/issues/new");
    expect(url.searchParams.get("title")).toBe("Docs: Teams");
    expect(url.searchParams.get("body")).toContain(
      "https://qrdx.dev/docs/teams",
    );
  });
});
