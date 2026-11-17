import { createFromSource } from "fumadocs-core/search/server";
import { docsIndex } from "@/lib/docs-index";

// The docs search index (English, like the docs).
// https://docs.orama.com/docs/orama-js/supported-languages
export const { GET } = createFromSource(docsIndex, { language: "english" });
