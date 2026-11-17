// The docs assistant's two tools (app/api/docs-chat), built on a
// DocsRetriever. The model sees search snippets and whole pages
// (toModelOutput); the browser sees only titles and links (the tools'
// outputs), so the stream stays small and the Sources list under each
// answer comes straight from the read_docs_page parts.
import { type Tool, tool } from "ai";
import { z } from "zod";
import { DOCS_CHAT } from "./config";
import {
  type DocsPage,
  DocsRetrievalError,
  type DocsRetriever,
  type DocsSearchHit,
} from "./retrieval";

/** What the browser gets for a search: titles and links only. */
export interface SearchDocsOutput {
  results: Pick<DocsSearchHit, "title" | "path" | "url">[];
}

/** What the browser gets for a page read: a source to list, or why there is none. */
export type ReadDocsPageOutput =
  | { title: string; path: string; url: string }
  | { error: string };

/** Pages read in one request, by path, for the model's eyes. */
export type PageStore = Map<string, DocsPage>;

// Annotated because ai 7's inferred tool types name @ai-sdk/provider types,
// which apps/app doesn't depend on directly (lib/ai/agent/tools.ts).
export type DocsChatTools = {
  search_docs: Tool<{ query: string }, SearchDocsOutput>;
  read_docs_page: Tool<{ path: string }, ReadDocsPageOutput>;
};

const text = (value: string) => ({ type: "text" as const, value });

const searchInput = z.object({
  query: z
    .string()
    .min(1)
    .max(DOCS_CHAT.maxQueryChars)
    .describe(
      "English words to search the docs for: the reader's question or its key terms, translated into English if needed.",
    ),
});

const readInput = z.object({
  path: z
    .string()
    .min(1)
    .max(DOCS_CHAT.maxPathChars)
    .describe(
      "A docs path from search_docs, such as /docs/developers/mcp or /docs/help/contact.",
    ),
});

/**
 * The tools for one request: `pages` collects what was read, so the model
 * gets each page's text while the browser gets its title and link.
 */
export function docsChatTools(
  retriever: DocsRetriever,
  pages: PageStore = new Map(),
): DocsChatTools {
  /** Every hit any search in this request returned, by path (for snippets). */
  const hits = new Map<string, DocsSearchHit>();
  let reads = 0;

  const search_docs = tool({
    description:
      "Search the QRdx docs, which are in English. Returns the matching pages (title, path, snippet), best first. Call this before answering.",
    inputSchema: searchInput,
    execute: async ({ query }): Promise<SearchDocsOutput> => {
      const result = await retriever.search(query);
      for (const hit of result.hits) hits.set(hit.path, hit);
      return {
        results: result.hits.map(({ title, path, url }) => ({
          title,
          path,
          url,
        })),
      };
    },
    toModelOutput: ({ output }) => {
      if (output.results.length === 0) {
        return text(
          "No docs page matched. Try once more with other words, or tell the reader the docs don't cover it.",
        );
      }
      return text(
        output.results
          .map((hit, index) => {
            const full = hits.get(hit.path);
            const section = full?.section ? ` [${full.section}]` : "";
            const snippet = full?.snippet ? `\n   ${full.snippet}` : "";
            return `${index + 1}. ${hit.title}${section} (${hit.path})${snippet}`;
          })
          .join("\n"),
      );
    },
  });

  const read_docs_page = tool({
    description: `Read one docs page as Markdown, by its path from search_docs. Read at most ${DOCS_CHAT.maxPagesPerAnswer} pages per answer.`,
    inputSchema: readInput,
    execute: async ({ path }): Promise<ReadDocsPageOutput> => {
      if (reads >= DOCS_CHAT.maxPagesPerAnswer) {
        return {
          error: `You already read ${DOCS_CHAT.maxPagesPerAnswer} pages. Answer from them.`,
        };
      }
      try {
        const page = await retriever.readPage(path);
        reads++;
        pages.set(page.path, page);
        return { title: page.title, path: page.path, url: page.url };
      } catch (error) {
        if (error instanceof DocsRetrievalError)
          return { error: error.message };
        throw error;
      }
    },
    toModelOutput: ({ output }) => {
      if ("error" in output) return text(output.error);
      const page = pages.get(output.path);
      if (!page) return text(`Read ${output.title} (${output.url}).`);
      return text(`# ${page.title}\nURL: ${page.url}\n\n${page.markdown}`);
    },
  });

  return { search_docs, read_docs_page };
}
