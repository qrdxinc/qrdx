// What lib/source.ts (the compiled docs, for the docs pages) and
// lib/docs-index.ts (the docs index, for route handlers) share, so both list
// the same pages at the same URLs. No content is read here.

/** fumadocs `loader()` options for the docs. */
export const docsLoaderOptions = { baseUrl: "/docs" };

/** A docs page's Open Graph image, served by app/og/docs/[...slug]. */
export function getPageImage(page: { slugs: string[] }) {
  const segments = [...page.slugs, "image.png"];

  return {
    segments,
    url: `/og/docs/${segments.join("/")}`,
  };
}
