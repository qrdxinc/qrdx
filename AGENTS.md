# AGENTS.md

Guidance for coding agents (Claude Code, Codex, Cursor, Copilot and others) and contributors working in this repository. People setting up for the first time should read [CONTRIBUTING.md](CONTRIBUTING.md); this file is the short version plus the rules that are easy to break.

## What this is

QRdx is an open-source QR code platform (https://qrdx.dev): a free static QR generator, dynamic codes with hosted pages and analytics, a REST API, an MCP server, a CLI and a React library. It's a Turborepo monorepo that uses Bun 1.4 to install packages and run scripts, and Node.js 22 to run the app, the tests and the builds.

| Path | What it is |
| --- | --- |
| `apps/app` | The Next.js app behind qrdx.dev: marketing pages, the blog, the editor (`app/(app)/playground`), the signed-in app (`app/(app)/dashboard`, `app/(app)/settings`), API routes (`app/api`, served as `api.qrdx.dev/v1` and `mcp.qrdx.dev/mcp`). It serves the docs' URLs through `apps/docs` |
| `apps/docs` | The docs (qrdx.dev/docs), in English only: their content (`content/docs`) and the docs site, a Next.js app (package `docs`) the main app proxies at the same URLs when `DOCS_ZONE_URL` is set; without it, the main app redirects the docs' URLs to qrdx.dev. Its README lists what it reads from `apps/app` |
| `apps/email` | The emails' preview server (React Email, http://localhost:3003); not deployed, not in the pre-push hook |
| `packages/qrdx` | The QR engine and React library, published to npm as `qrdx` |
| `packages/cli` | `@qrdx/cli`, the command-line generator |
| `packages/database` | Drizzle schema (`schema.ts`) and the database client |
| `packages/auth` | Better Auth setup |
| `packages/email` | `@repo/email`: the email templates (`templates/`, React Email), rendering and the Resend sender; the app binds it to its environment in `apps/app/lib/email/send.ts`. Templates take an `intl` (the copy is `emails` in `apps/app/messages/en.json`) |
| `packages/design-system` | Shared UI (shadcn/ui), icons, styles, the logo, figures, JSON-LD helpers and the Open Graph image frame with its fonts |
| `packages/integrations`, `packages/integration-kit` | The integrations catalogue and shared types |
| `packages/config` | `@repo/config`: platform constants (brand, URLs, contact emails, social links, shared limits); import these instead of typing `qrdx.dev` or an email address |
| `packages/availability` | `@repo/availability`: which built-in features a deployment can offer, from the names of the variables it has set (pure; the app passes its environment in) |
| `packages/analytics` | `@repo/analytics`: the cookie banner and consent, `track()`, and the browser tools consent gates (PostHog, Umami, Featurebase); the app registers its untracked pages and keeps the server parts (`apps/app/lib/analytics`) |
| `packages/i18n` | `@repo/i18n`: the languages (`config.ts`), translated paths and their URLs, the docs' URL rules, and the loader for the docs' messages (a copy of the docs' part of `apps/app/messages/en.json`, written before use, not committed) |
| `packages/rate-limit`, `packages/next-config`, `packages/typescript-config` | Shared helpers and config |
| `plugins/*` | Chrome, Figma, Raycast and Canva plugins, and the Google Workspace add-on |
| `skills/` | Agent Skills, such as `generate-qr` |

## Run, test, check

```bash
bun install
bun run --filter qrdx build:inplace     # the app imports the engine's dist/, so build it first
bun run --filter app dev                # http://localhost:3000 (needs apps/app/.env.local, see CONTRIBUTING)
bun run --filter docs dev               # the docs on http://localhost:3001 (needs apps/docs/.env.local, see its README);
                                        # DOCS_ZONE_URL=http://localhost:3001 in apps/app/.env.local shows them through :3000
bun run --filter email dev              # every email template on http://localhost:3003 (no env needed)
bun x ultracite fix <files you changed> # format and lint (Ultracite runs Biome)

cd apps/app
bun x tsc --noEmit                      # typecheck the app (on a fresh clone, run `bun run typegen:app` from the root first)
bun x vitest run                        # unit and integration tests (tests/**); no database or network
bun run test:node                       # node:test suites next to the code
```

The pre-push hook runs the engine build, both typechecks, the lint check (`bun run lint:ci`, which is `ultracite check`) and the tests of the packages your branch changes compared with `origin/staging`, plus the packages that depend on them (`turbo --affected`; unchanged results come from the turbo cache). `bun run prepush`, or `QRDX_PREPUSH=full git push`, runs every test. CI runs on every pull request (affected packages for pull requests into `staging`, everything for release pull requests into `main`) and on every push to `staging` and `main` (everything). A release pull request and the push to `main` reuse the staging run when the code is identical, so a release doesn't wait for the suite again (`scripts/ci-reuse-check.sh`). A second CI job, "Build the main app", runs `next build` of `apps/app` offline (Vercel's settings, no database, `scripts/block-network.mjs`) when the app or a package it uses changes, so a build-only failure fails CI rather than the production deploy; CONTRIBUTING.md has the command to run it locally. Merging to `main` doesn't deploy: `.github/workflows/production-deploy.yml` deploys `main` every 6 hours when it moved (then the marketing site and the console from qrdxinc/cloud's `main`, the docs site, the Discord post and the search engines), because every Vercel deployment is billed. `gh workflow run production-deploy.yml -R qrdxinc/qrdx` deploys now; use it rather than `vercel deploy --prod`. The e2e suites (`bun run --filter app test:e2e`, `test:e2e:app`, `test:e2e:site`) need a running dev server and Chrome.

## Rules

- **The engine is consumed through `dist/`.** After changing `packages/qrdx/src`, rebuild with `bun run --filter qrdx build:inplace`. Never run `bun run build` in `packages/qrdx` while a dev server is running: it deletes `dist/` first and breaks the running app. Pulls, rebases and branch switches that change the engine rebuild it for you (`.husky/post-merge`, `post-checkout`, `post-rewrite` run `scripts/rebuild-engine-if-changed.sh`; skip with `QRDX_SKIP_ENGINE_REBUILD=1`).
- **Bun installs, Node runs.** Bun is only the package manager and script runner. Next.js, Vitest, the `node --test` suites, Vercel and Docker all run on Node.js 22, so don't add `--bun` to scripts. Run tests with `bun run test` (or `bun run test:node`, `bun x vitest run`), never `bun test`: that's Bun's own test runner, and these suites aren't written for it. Add a dependency with `bun add <dep>` (`-d` for dev) inside the package that imports it, and commit `bun.lock`. Packages are installed isolated, so code can only import what its own `package.json` lists.
- **Treat the database as shared and live.** `DATABASE_URL` may point at a database with real users (a self-hoster's production, or one database shared by dev and prod). Never run `bun run db:push`, migrations, destructive SQL or scripts that write data against a database you weren't told is disposable. Schema changes are additive and idempotent: new columns nullable or defaulted, no drops or renames in the same change. When you can't apply a change yourself, put the SQL in the pull request description and say so.
- **No placeholders in shipped content.** Docs, legal pages and UI copy go live as written: no `[[PLACEHOLDER]]` (a test fails on them), no "TBD", no invented examples presented as real.
- **Honest copy.** Never describe a feature that isn't built or isn't available on the deployment. Product counts come from code, not from memory: write `{facts.bodyPatterns}` and the other tokens from `apps/app/lib/product-facts.ts` in MDX, and import the catalogues in TSX. Features that need setup are gated by `lib/feature-availability*` (the rules are in `packages/availability`); docs use `<IfAvailable>`.
- **Translated pages read their copy from `apps/app/messages/en.json`.** The playground, `/ai`, `/ai/art`, `/mcp` and `/scan` live under `app/[lang]` and exist in every language in `packages/i18n/config.ts`, with the header, footer and cookie banner (the signed-in app and emails are translated too, without URL prefixes). The marketing pages (home, `/pricing`, tools, generators and the rest of `englishOnly` in `packages/i18n/localized-paths.json`) are English only: they also live under `app/[lang]`, and their translated URLs redirect to English. Change their English in `en.json` (counts and prices stay in code as ICU arguments), then run `bun run --filter app i18n:translate --all` if you have an AI Gateway key; otherwise the new strings show in English until someone does. `bun run --filter app i18n:check` must pass. Every other page lives under `app/(app)`: put a new page there (or under `app/[lang]/(home)` if its path is in `localized-paths.json`), never straight under `app/` (`tests/i18n/split-roots.test.ts` fails on one). CONTRIBUTING.md, "Translating QRdx", covers adding a language.
- **The docs live in `apps/docs`, in English only.** Pages are `apps/docs/content/docs` (MDX, one file a page). Don't add translated copies (`<page>.<locale>.mdx`, `meta.<locale>.json`): a test fails on them. The docs URLs the other languages once had (`/es/docs/...`) redirect to the English page (`translatedDocsRedirects` in `packages/i18n/docs.ts`). The docs' interface strings are the `docs` key of `apps/app/messages/en.json`, which the other catalogs don't translate. The main app's `openapi:generate` script writes the API reference pages. The main app has no docs code of its own: with `DOCS_ZONE_URL` set it proxies the docs' URLs to the docs site, and without it it redirects them to qrdx.dev (self-hosted deployments read the docs there).
- **Write like a person.** Blog posts and other long-form copy should read as if a person wrote them: plain words, no filler, no sales language.
- **UI conventions.** Icons come from `iconsax-reactjs` (extra ones live in `packages/design-system/components/icons.tsx`). Don't edit `packages/design-system/components/ui/**`; compose around it. Keep the look monochrome with one accent colour.
- **Environment variables are declared, then read through `env`.** Each package declares the variables it reads in its `keys.ts`; `apps/app/env.ts` extends them and adds the app's own. Code reads `env` (`import { env } from "@/env"`) or the package's `keys()` rather than `process.env`; the exceptions are `NODE_ENV` and literal `NEXT_PUBLIC_*` reads in client-safe modules, which Next inlines. Only `NEXT_PUBLIC_APP_URL`, `DATABASE_URL` and `BETTER_AUTH_SECRET` are required; a new variable is optional and switches off only its own feature. List it in `apps/app/.env.example` too (a test checks), the only env file a contributor copies (to `apps/app/.env.local`).
- **Keep secrets out.** Never print or commit `.env` values, session cookies or tokens. Tests use fakes (`apps/app/tests/support/`).
- **This Next.js has breaking changes from what you may know.** Read the guides in `apps/app/node_modules/next/dist/docs/` before relying on memory. `apps/app/AGENTS.md` is written by `next dev`; leave it alone.

## For agents using QRdx (not editing it)

- Site index: https://qrdx.dev/llms.txt, full docs: https://qrdx.dev/llms-full.txt, any docs page as Markdown: add `.md` to its URL.
- MCP server: `https://mcp.qrdx.dev/mcp` (Streamable HTTP, no key). REST API: `https://api.qrdx.dev/v1`, described by https://qrdx.dev/openapi.json.
- How-to: https://qrdx.dev/docs/developers/ai-agents

## More

- [CONTRIBUTING.md](CONTRIBUTING.md): setup, project layout, checks and pull requests
- [SECURITY.md](SECURITY.md): report vulnerabilities privately, never in a public issue
- [TRADEMARK.md](TRADEMARK.md): the code is open source; the QRdx name and logo are not
- [LICENSE](LICENSE) and [LICENSING.md](LICENSING.md): AGPL-3.0-or-later for the app; `packages/qrdx`, `packages/cli`, `plugins/*`, `skills/generate-qr` and `packages/docs-assets/registry/qrdx` (the shadcn/ui registry components) are MIT (their own `LICENSE` files); `apps/app/ee` and `packages/auth/ee` are under the QRdx Commercial License (their `LICENSE.md`)
