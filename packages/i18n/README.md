# @repo/i18n

The languages QRdx is translated into, which pages exist in each one and at what URL, the docs' URL rules (the docs are English only), and a loader for the messages the docs read. Plain TypeScript with no React, no environment access and no runtime dependencies, so client components, server code, `next.config.ts` and another app can all import it.

```ts
import { LOCALES, localeFromSegment } from "@repo/i18n/config";
import { localizeHref } from "@repo/i18n/paths";

localizeHref("/playground", "es"); // "/es/playground"
localizeHref("/pricing", "es"); // "/pricing" (English only)
```

| Module | What it holds |
| --- | --- |
| `config.ts` (`@repo/i18n/config`) | `LOCALE_CONFIG`, the languages: URL segment, names, hreflang, `og:locale`, direction, and review state. Adding a language starts here (CONTRIBUTING.md, "Translating QRdx") |
| `paths.ts` (`@repo/i18n/paths`), `localized-paths.json` | The translated pages (`paths` in `localized-paths.json`, by route path), the English-only marketing pages under `app/[lang]` (`englishOnly`), the English-only pages the site zone serves in every language (`siteTranslated`: the QR code and barcode generators, owner decision 23 Nov 2026), the English-only pages outside `app/[lang]` whose translated URLs redirect to English too (`englishOnlyOutside`: the blog, the comparisons' pages, the legal pages and the rest the site serves), and `localizePath`, `localizeHref`, `splitLocale`, `localizeSitePath` |
| `routing.ts` (`@repo/i18n/routing`) | The `next.config.ts` rewrites and redirects that give English its unprefixed URLs, and the redirects from the English-only pages' old translated URLs (`/es/pricing` → `/pricing`, `/es/blog` → `/blog`), less the pages the site serves in every language while its group for them is on (`except`) |
| `review.ts` (`@repo/i18n/review`) | The native review gate: which pages search engines may index in each language. The QR code generators are indexed in every language, machine-made or not (`INDEXED_MACHINE_PATHS`, owner decision 23 Nov 2026); the barcode generators follow their languages' review state (owner decision 25 Nov 2026) |
| `docs.ts` (`@repo/i18n/docs`) | The docs' URLs: `isDocsPath()`, `translatedDocsRedirects()` (the redirects from the other languages' old docs URLs, such as `/es/docs/...`, to the English page), and the docs zone's routing: `docsZoneRewrites()` (the main app's rewrites to the docs site at `DOCS_ZONE_URL`), `docsOriginRedirects()` (its redirects to qrdx.dev without one) and `isDocsPagePath()` (which links stay inside the docs site) |
| `messages.ts` (`@repo/i18n/messages`) | `mergeMessages`, `pickMessages`, `CHROME_NAMESPACES`, and `DOCS_NAMESPACES`, the English namespaces copied for the docs, with `DOCS_MESSAGES_COMMAND`, which writes the copy |
| `docs-messages.ts` (`@repo/i18n/docs-messages`) | `loadDocsMessages()`: the docs' English catalog, read from `messages/en.json` (written before use, not committed) |
| `index.ts` (`@repo/i18n`) | `config`, `paths`, `docs` and `review` together |

## The docs' messages

`apps/app/messages` stays the only place anyone edits copy. An app that can't import `apps/app` reads the English namespaces the docs use (`DOCS_NAMESPACES`: `docs`, `footer`, `meta`, `consent`) from `messages/en.json` here, which `bun run --filter app i18n:docs-messages` (`apps/app/lib/i18n/docs-messages.ts`) writes. The folder is gitignored: that app runs the command right before it builds or starts, like `facts:snapshot` for `@repo/config/facts`, so the copy is always made from the current catalog and can't go stale between merges. `loadDocsMessages` throws, naming the command, when the file is missing.

`apps/app/tests/i18n/i18n-package.test.ts` builds the copy in memory and checks that it loads like the app's English catalog; `apps/docs/tests/i18n/docs-namespaces.test.ts` checks that every namespace the docs' code reads is in `DOCS_NAMESPACES`.

## How the app uses it

- The main app imports the package directly (`@repo/i18n/config`, `@repo/i18n/paths`, …). Its own `lib/i18n/messages.ts` loads the full catalogs; the docs site's `lib/i18n/messages.ts` loads the English copy.
- `next.config.ts` imports `@repo/i18n/docs` and `@repo/i18n/routing` directly. Next compiles the config with the app's tsconfig paths, and a file in a subfolder of the app that imports `@repo/*` can't be resolved there, so modules this config loads use relative imports only.
