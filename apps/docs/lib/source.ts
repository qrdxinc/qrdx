import {
  type InferMetaType,
  type InferPageType,
  loader,
} from "fumadocs-core/source";
import { openapiPlugin } from "fumadocs-openapi/server";
import { docs } from "@/.source/docs";
import { docsLoaderOptions } from "@/lib/docs-common";
import { resolveDocsIcon } from "@/lib/docs-icons";

// The compiled docs, for the docs pages (app/docs) only. Everything else
// reads the docs from lib/docs-index.ts: a route handler that imports this
// file compiles every docs page a second time.

export { getPageImage } from "@/lib/docs-common";

/** The docs (content/docs), at /docs/.... English only. */
export const source = loader({
  ...docsLoaderOptions,
  source: docs.toFumadocsSource(),
  icon: resolveDocsIcon,
  // Method badges on the API reference pages in the sidebar.
  plugins: [openapiPlugin()],
});

export type Page = InferPageType<typeof source>;
export type Meta = InferMetaType<typeof source>;
