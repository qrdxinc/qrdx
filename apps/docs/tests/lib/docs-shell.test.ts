// The docs shell's own pieces: the Markdown copies of the new MDX blocks
// (components/mdx/frame.tsx, video.tsx, plan-note.tsx and the Shots lane's
// <Shot />), and the GitHub links under a page.

import { describe, expect, it } from "vitest";
import { cleanLlmMarkdown } from "@/lib/agents/llm-markdown";
import { getGitHubIssueUrl, getGithubEditUrl } from "@/lib/github";

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

describe("GitHub links under a page", () => {
  it("edits the file that rendered, index pages included", () => {
    expect(getGithubEditUrl("help/index.mdx")).toBe(
      "https://github.com/qrdxinc/qrdx/edit/main/apps/docs/content/docs/help/index.mdx",
    );
    expect(getGithubEditUrl("developers/mcp.es.mdx")).toBe(
      "https://github.com/qrdxinc/qrdx/edit/main/apps/docs/content/docs/developers/mcp.es.mdx",
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
