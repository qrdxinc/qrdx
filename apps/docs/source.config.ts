import {
  rehypeCodeDefaultOptions,
  remarkSteps,
} from "fumadocs-core/mdx-plugins";
import {
  defineConfig,
  defineDocs,
  frontmatterSchema,
  metaSchema,
} from "fumadocs-mdx/config";
import jsonSchema from "fumadocs-mdx/plugins/json-schema";
import lastModified from "fumadocs-mdx/plugins/last-modified";
import { remarkAutoTypeTable } from "fumadocs-typescript";
import type { ElementContent } from "hast";
import { z } from "zod";
import { docsIndex } from "./lib/docs-index-plugin";
import { fillFactsDeep } from "./lib/product-facts";
import { remarkNpmStatus } from "./lib/remark-npm-status";
import { remarkProductFacts } from "./lib/remark-product-facts";
import { gitFileDate } from "./lib/seo-dates";
// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections
// `.transform(fillFactsDeep)`: frontmatter strings can quote product counts as
// `{facts.bodyPatterns}` (lib/product-facts.ts), filled in at build time.
// The docs' content (content/docs). The main app's translation and OpenAPI
// scripts write into it too.
export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: frontmatterSchema
      .extend({
        index: z.boolean().default(false),
        /**
         * API routes only
         */
        method: z.string().optional(),
        /** API reference pages (fumadocs-openapi, `bun run openapi:generate`) */
        _openapi: z.looseObject({}).optional(),
      })
      .transform(fillFactsDeep),
    // No `postprocess.includeProcessedMarkdown`: each page's Markdown (the
    // .md and llms routes) comes from the docs index (lib/docs-index.ts), so
    // the compiled pages don't carry a copy.
  },
  meta: {
    schema: metaSchema.extend({
      description: z.string().optional(),
    }),
  },
});

export default defineConfig({
  plugins: [
    jsonSchema({
      insert: true,
    }),
    // Each page's "last modified" date comes from git, following moves:
    // fumadocs' own git dates count a moved file as changed (gitFileDate).
    // A Docker build has neither the git binary nor the .git folder (see
    // .dockerignore), so there the dates are left out. The sitemap already
    // handles pages without one.
    lastModified({
      versionControl: async (file) => gitFileDate(file),
    }),
    // .source/docs.ts, .source/content.ts and the docs index the route
    // handlers read (lib/docs-index.ts), so the build compiles the docs once.
    docsIndex({ collection: "docs" }),
  ],
  mdxOptions: {
    rehypeCodeOptions: {
      lazy: true,
      langs: ["ts", "js", "html", "tsx", "mdx"],
      inline: "tailing-curly-colon",
      // `language-<lang>` on the <code>: the code block's header names the
      // language when the block has no title (components/mdx/code-block.tsx).
      addLanguageClass: true,
      themes: {
        // Catppuccin Latte's greens, peaches and pinks are 2.3–3.5:1 on a
        // light code block; GitHub Light Default's code tokens are 4.8–15:1
        // (comments 4.3:1). GitHub Dark Default pairs with it: the same
        // token colours, calm on the docs' dark card (the block's
        // background is the docs' own, not the theme's).
        light: "github-light-default",
        dark: "github-dark-default",
      },
      transformers: [
        ...(rehypeCodeDefaultOptions.transformers ?? []),
        {
          name: "@shikijs/transformers:remove-notation-escape",
          code(hast) {
            function replace(node: ElementContent): void {
              if (node.type === "text") {
                node.value = node.value.replace("[\\!code", "[!code");
              } else if ("children" in node) {
                for (const child of node.children) {
                  replace(child);
                }
              }
            }

            replace(hast);
            return hast;
          },
        },
      ],
    },
    remarkCodeTabOptions: {
      parseMdx: true,
    },
    remarkNpmOptions: {
      persist: {
        id: "package-manager",
      },
    },
    // No math, Twoslash or TypeScript-to-JavaScript plugins: no page uses
    // them, and each loaded CSS or a compiler on every page. The component
    // pages' props tables are `<auto-type-table path type />`, expanded
    // from the registry's TypeScript by remarkAutoTypeTable.
    remarkPlugins: [
      remarkProductFacts,
      remarkNpmStatus,
      remarkSteps,
      remarkAutoTypeTable,
    ],
  },
});
