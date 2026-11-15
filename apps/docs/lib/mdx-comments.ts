// MDX comments: `{/* shot: … */}` markers the content lanes leave for the
// Shots lane, and notes to other writers. They render nothing in HTML but
// the Markdown copies (.md, llms-full.txt) are sliced from the authored
// source, so they survive there unless taken out.

/** An expression node (block or inline) that holds only a comment, the MDX comment form. */
export function isMdxComment(node: { type: string; value?: unknown }): boolean {
  if (node.type !== "mdxFlowExpression" && node.type !== "mdxTextExpression") {
    return false;
  }
  return typeof node.value === "string" && isCommentOnly(node.value);
}

/** `/* … *​/`, nothing else, whitespace around it allowed. */
function isCommentOnly(expression: string): boolean {
  const text = expression.trim();
  return (
    text.startsWith("/*") &&
    text.endsWith("*/") &&
    !text.slice(2, -2).includes("*/")
  );
}

/** Pattern for a comment expression in Markdown text (never inside code: callers mask code first). */
export const MDX_COMMENT = /\{\s*\/\*[\s\S]*?\*\/\s*\}/g;

/**
 * The MDX source with every comment expression outside code turned into
 * spaces, newlines kept, so positions stay the same: the search data and
 * the Markdown copy are sliced from the source by position, and a comment
 * inside a paragraph would otherwise be sliced along with it. Code fences
 * and inline code are left alone (a `{/* … *​/}` there is code).
 */
export function blankMdxComments(source: string): string {
  const lines = source.split("\n");
  const inFence = fenceMap(lines);
  let result = "";
  let last = 0;
  for (const match of source.matchAll(MDX_COMMENT)) {
    const start = match.index;
    const startLine = source.slice(0, start).split("\n").length - 1;
    const keep =
      inFence[startLine] ||
      inInlineCode(lines[startLine] ?? "", columnOf(source, start));
    result += source.slice(last, start);
    result += keep ? match[0] : match[0].replace(/[^\n]/g, " ");
    last = start + match[0].length;
  }
  return result + source.slice(last);
}

/** For each line, whether it sits inside a fenced code block (fence lines included). */
function fenceMap(lines: string[]): boolean[] {
  let fence: string | null = null;
  return lines.map((line) => {
    const open = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const closes =
        open && open[1][0] === fence[0] && open[1].length >= fence.length;
      if (closes) fence = null;
      return true;
    }
    if (open) {
      fence = open[1];
      return true;
    }
    return false;
  });
}

/** The column of `offset` within its line. */
function columnOf(text: string, offset: number): number {
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  return offset - lineStart;
}

/** Whether `column` of `line` is inside an inline code span. */
function inInlineCode(line: string, column: number): boolean {
  let open = false;
  for (let i = 0; i < column; i++) if (line[i] === "`") open = !open;
  return open;
}

/** `text` without its comment expressions; a comment alone on a line takes its line with it. */
export function stripMdxComments(text: string): string {
  return text
    .replace(new RegExp(`^[ \\t]*${MDX_COMMENT.source}[ \\t]*\\n?`, "gm"), "")
    .replace(MDX_COMMENT, "");
}
