# Contributing to QRdx

Thanks for your interest in contributing. This guide covers local setup, the project layout, the checks to run before opening a pull request, and how we review changes.

Not sure where to start? See [Good first issues](#good-first-issues) below. For questions, use [Q&A in Discussions](https://github.com/qrdxinc/qrdx/discussions/categories/q-a) or the [QRdx Discord](https://discord.gg/856fWMrYBm), and [SUPPORT.md](SUPPORT.md) lists where everything else goes. To report a security problem, follow [SECURITY.md](SECURITY.md) instead of opening a public issue. If you work with a coding agent, [AGENTS.md](AGENTS.md) has the short version of this guide and the rules that are easy to break.

## Prerequisites

- Node.js 22, version 22.22.3 or later (CI, Docker and production run Node 22)
- [Bun](https://bun.com/docs/installation) 1.4 to install dependencies and run scripts (the exact version is pinned in `package.json` under `packageManager`); the app, its tests and its builds run on Node.js
- A Postgres database for the web app: a free [Neon](https://neon.tech) database, or the Docker Compose Postgres described below

You don't need a database or any environment variables to work on the React library (`packages/qrdx`) or the CLI (`packages/cli`).

## Local setup

1. **Fork and clone**

   Work happens on the `staging` branch. `main` is what runs on qrdx.dev, so branch from `staging`:

   ```bash
   git clone https://github.com/<your-username>/qrdx.git
   cd qrdx
   git remote add upstream https://github.com/qrdxinc/qrdx.git
   git fetch upstream staging
   git checkout -b my-change upstream/staging
   ```

2. **Install dependencies and build the engine**

   ```bash
   bun install
   bun run --filter qrdx build:inplace
   ```

   The app imports the QR engine from `packages/qrdx/dist`, so build it once after installing, and again with `build:inplace` after you change `packages/qrdx/src`. Git hooks rebuild it for you when a pull, rebase or branch switch changes the engine (set `QRDX_SKIP_ENGINE_REBUILD=1` to skip that). Don't run `bun run build` inside `packages/qrdx` while the dev server is running: it deletes `dist/` first, and the app breaks until the build finishes.

   To add a dependency, run `bun add <package>` (`bun add -d` for a dev dependency) in the folder of the package that imports it, and commit the updated `bun.lock`. Each package only sees the dependencies its own `package.json` lists.

3. **Configure the environment**

   Next.js loads env files from the app directory, and the template lives there too:

   ```bash
   cp apps/app/.env.example apps/app/.env.local
   ```

   In `apps/app/.env.local`, set the three required values (`NEXT_PUBLIC_APP_URL`, `DATABASE_URL`, `BETTER_AUTH_SECRET`). To sign in locally, also add a [GitHub OAuth app](https://github.com/settings/developers) with the callback URL `http://localhost:3000/api/auth/callback/github`. Every other variable is optional, and `apps/app/.env.example` explains each one. It's the only env file you need: the database scripts (`bun run db:push` and the other `db:*` scripts) read `DATABASE_URL` from it too.

   The app checks its environment when it starts (`next dev`, `next build` and a production server): if a required value is missing, or a value is set but invalid, it stops and names the variable. The schema is `apps/app/env.ts`, which extends the `keys.ts` of `packages/analytics`, `packages/auth`, `packages/config`, `packages/database`, `packages/email`, `packages/next-config` and `packages/rate-limit`. A new variable goes in the `keys.ts` of the package that reads it, or in `apps/app/env.ts` if only the app does, and in `apps/app/.env.example`; server code reads it from `env` (`import { env } from "@/env"`) or the package's `keys()` rather than from `process.env`.

4. **Set up the database**

   With Neon:

   ```bash
   bun run db:push
   ```

   `bun run db:push` changes whatever database `DATABASE_URL` points at. Only run it against a development database of your own that you can throw away, never a shared or production one.

   Or with Postgres in Docker:

   ```bash
   docker compose up -d db db-proxy
   docker compose run --rm migrate
   ```

   then add these lines to `apps/app/.env.local`:

   ```bash
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/qrdx
   DATABASE_HTTP_ENDPOINT=http://localhost:4444/sql
   ```

5. **Run the app**

   ```bash
   bun run --filter app dev
   ```

   Open http://localhost:3000. On a fresh clone, run `bun run typegen:app` once before your first typecheck (the pre-push hook also runs it). Without `apps/app/.env.local` it uses the same placeholder settings as CI.

6. **Run the docs (optional)**

   The docs at `/docs` are an app of their own, `apps/docs`. Without it, the main app sends every docs URL to the same page on qrdx.dev. To work on the docs:

   ```bash
   cp apps/docs/.env.example apps/docs/.env.local
   bun run --filter docs dev
   ```

   Open http://localhost:3001/docs. To see them through the main app, as readers do, add `DOCS_ZONE_URL=http://localhost:3001` to `apps/app/.env.local` and restart `bun run --filter app dev`.

   To see the emails while you work on them, start the preview server, which needs no environment, database or Resend key:

   ```bash
   bun run --filter email dev
   ```

   Open http://localhost:3003. It shows every template in `packages/email/templates` that has `PreviewProps`, in English; a new template needs `PreviewProps` to appear. Restart it after a new template or a change to the copy in `apps/app/messages/en.json`: it writes its preview files and its copy of the English catalog when it starts. It isn't part of the pre-push hook, CI, Vercel's build or the root `bun run dev`.

## Project structure

| Path | What it is |
| --- | --- |
| `apps/app` | The Next.js app behind qrdx.dev: marketing pages, the editor (`app/(app)/playground`), the blog, the signed-in app (`app/(app)/dashboard`, `app/(app)/settings`), admin, and the API routes (`app/api`, served as `api.qrdx.dev/v1` and `mcp.qrdx.dev/mcp`). It serves the docs' URLs through `apps/docs` |
| `apps/docs` | The docs: their pages (`content/docs`, MDX, every language) and the docs site, a Next.js app deployed to a separate Vercel project from `.github/workflows/docs-deploy.yml`. With `DOCS_ZONE_URL` set, the main app proxies `/docs` and the other docs URLs to it; without it (self-hosting, local development), it redirects them to qrdx.dev. Its README says what it reads from `apps/app` |
| `apps/email` | The preview server for the emails (React Email, port 3003); it writes a preview file for each template before it starts (`scripts/prepare.mjs`) |
| `packages/qrdx` | The QR engine and React library, published to npm as `qrdx` |
| `packages/cli` | The command-line tool, published to npm as `@qrdx/cli` |
| `packages/auth` | Better Auth server and client configuration |
| `packages/email` | `@repo/email`: the email templates and their layout (`templates/`, React Email), rendering, and sending through Resend; the app binds the sender to its environment in `apps/app/lib/email/send.ts` |
| `packages/database` | Drizzle schema (`schema.ts`) and the database client |
| `packages/design-system` | Shared UI components (shadcn/ui), icons, styles and fonts; the logo, the figure set, JSON-LD helpers and the Open Graph image frame (`og/`, with the Geist files server images use) |
| `packages/integrations`, `packages/integration-kit` | The integrations catalogue (`src/catalog`), the connected-account integrations (`src/integrations`) and the shared integration types |
| `packages/config` | Platform constants: the brand, the hosted service's URLs, contact emails, social links and limits shared across the app (its README says what belongs there) |
| `packages/availability` | Which built-in features a deployment can offer (custom domains, AI, storage, email, the bots), decided from which variables are set; the app passes its environment in (its README says how the app and `/zone/availability.json` use it) |
| `packages/analytics` | The cookie banner and preferences, `track()`, and the browser-side tools consent gates (PostHog, Umami, Featurebase); its README says what an app passes in |
| `packages/i18n` | The languages (`config.ts`), which pages exist in each (`localized-paths.json`) and their URLs, the docs' languages, sidebar labels, search and SEO rules, and a copy of the docs' messages (its README says what's where) |
| `packages/rate-limit` | Upstash-based rate limiting |
| `packages/next-config`, `packages/typescript-config` | Shared Next.js config, env keys and Content-Security-Policy builder (`@repo/next-config/csp`), shared tsconfig presets |
| `plugins/chrome`, `plugins/figma`, `plugins/raycast`, `plugins/canva` | The Chrome extension, Figma plugin, Raycast extension and Canva app |
| `plugins/google-workspace` | The Google Workspace add-on for Docs, Sheets and Slides (Apps Script; its README has the tests and the deploy steps) |
| `skills/` | Agent skills, such as `generate-qr` |

### Raycast extension

`plugins/raycast` is published to the Raycast Store, which takes every file in that folder, so its README is the Store page and its CHANGELOG is the Store's version history: write both for people who install the extension from the Store. A Store release adds one entry at the top of the CHANGELOG, titled `## [Short Description] - {PR_MERGE_DATE}`. Notes for working on the extension go here instead.

You need Raycast and Node.js 22.22.3 or later. From the repository root:

```bash
bun run --filter qrdx-raycast dev         # ray develop: loads the extension into Raycast
bun run --filter qrdx-raycast lint        # Raycast's linter: ESLint and Prettier (120 columns)
bun run --filter qrdx-raycast typecheck
```

The commands then show up in Raycast's root search. `bun run --filter qrdx-raycast build` installs its build into Raycast as `dev` does, replacing the copy you have; to check that it builds without touching Raycast, run `bun x ray build -e dist -o <a scratch folder>` in `plugins/raycast`.

The extension takes `qrdx` from npm, as the Store's own build does, so a change to `packages/qrdx` reaches it only once that version is published and the extension's `qrdx` range is raised. Its pattern and frame lists come from that `qrdx`, so raising it brings the new shapes and frames along.

The Store builds the extension with npm, so the folder keeps a `package-lock.json` beside `package.json`. npm can't run inside this repository, so after changing one of the extension's dependencies, rewrite the lockfile from the root with `bun run raycast:lock` (it resolves the extension in a temporary folder). `apps/app/tests/repo/raycast-lock.test.ts` fails while the two disagree.

Store screenshots go in `plugins/raycast/metadata/` (2000 × 1250 PNG, up to six; Raycast's Window Capture can save them there). `bun run raycast:publish` from the root opens or updates the pull request to `raycast/extensions`. Two files in the folder are for this repository only: `turbo.json` (its build) and `LICENSE` (each `plugins/*` folder keeps its own; `raycast/extensions` doesn't accept one, since its MIT license covers every extension). After each publish, delete both from the Raycast pull request's branch.

## Checks before you open a pull request

CI (`.github/workflows/ci.yml`) runs these on every pull request and on every push to `staging` and `main`. Both branches require the job to pass before anything merges. A push to `staging` runs the full suite in the background after each merge. A release pull request into `main`, and the push to `main` it creates, hold the same code, so they reuse that result instead of testing it again (`scripts/ci-reuse-check.sh` compares git trees; it waits up to 20 minutes for a staging run that's still going, and falls back to the full suite when nothing matches). Manual runs always test everything.

```bash
bun x turbo build --filter=qrdx --filter=@qrdx/cli   # the main app and CLI use qrdx's build output; the CLI tests run its dist/index.js
bun run typecheck                   # all packages with a typecheck script
bun run typegen:app && bun run typecheck:app     # route types (PageProps, LayoutProps), then the app typecheck
bun run --filter app i18n:check     # translations against English (see Translating QRdx)
bun run test                        # every package's tests, through turbo
bun run lint:ci                     # ultracite check: Biome's lint and format rules over the whole repository
```

A pull request into `staging` tests only the packages it changes and the packages that depend on them (`turbo test --affected`). A change to the docs' pages (`apps/docs/content`) runs the docs site's tests and the main app's, which check the app against them, and skips the engine's; a change to `packages/qrdx` runs the engine, the CLI and the main app. Pushes to `staging` and `main`, release pull requests into `main` and manual runs test everything, unless an earlier full run already passed on the identical code (see above). Turbo's cache (`.turbo/cache`, kept between runs with `actions/cache`) replays any task whose inputs haven't changed, and the job's summary lists what was replayed and what ran.

A second job, "Build the main app", runs `next build` in `apps/app` at the same time, so a change that only breaks the build (an export Next rejects, a client component importing server code, a page that can't be prerendered) fails CI instead of the production deploy. A pull request into `staging` gets it when it changes the app or a package the app uses; everything else always does, unless an earlier full run of the same code passed. It builds the way Vercel does (`VERCEL=1`: no type check inside the build), offline: the pages that read the database while they render are rendered at request time instead (`QRDX_BUILD_WITHOUT_DATABASE=1`, as in the Dockerfile), and `scripts/block-network.mjs` blocks every connection off the machine. To run it yourself, build the engine (`bun run --filter qrdx build:inplace`), then, with CI's placeholders:

```bash
cd apps/app
DATABASE_URL=postgresql://ci:ci@localhost:5432/ci NEXT_PUBLIC_APP_URL=http://localhost:3000 \
BETTER_AUTH_SECRET=ci-placeholder-secret-not-used-for-anything-real \
VERCEL=1 QRDX_BUILD_WITHOUT_DATABASE=1 NODE_OPTIONS="--import=$PWD/../../scripts/block-network.mjs" \
bun x next build
```

Variables set in the shell win over `apps/app/.env.local`, but `next build` still reads the rest of that file, so move it aside to build with exactly CI's settings. It can run while `next dev` does: dev keeps its files in `.next/dev`.

The first job also checks the `qrdx` package the way npm ships it. `packages/qrdx/scripts/check-package.mjs` packs it with `bun pm pack`, as the Publish workflow does, and runs [publint](https://publint.dev) and [are-the-types-wrong](https://arethetypeswrong.github.io) on the tarball, so an entry that Node, TypeScript or a bundler can't resolve properly fails CI instead of breaking for the people who install it. Any publint message fails it, except the suggestion to declare `"type"`, which the package leaves out on purpose (the script says why), and so does any problem are-the-types-wrong finds under node10, node16 or bundler resolution. A pull request into `staging` gets it when it changes `packages/qrdx`, a package `qrdx` uses or the CI workflow; everything else always does. After changing the package's `exports`, its build or the files it publishes, run it yourself:

```bash
bun run --filter qrdx build:inplace
bun run --filter qrdx check:package
```

The same job checks the React components on every React line the package supports (`react >=16.8.0`), on the same terms. `packages/qrdx/scripts/react-compat.mjs` packs the package the same way and installs the tarball with npm next to React 16.8, 17, 18 and the React 19 the package's own tests use, each in a folder of its own. Each React renders a set of designs (the default code, a gradient, dots with custom eyes, eye shapes and looks, the dot ring frame, a logo, a frame with text, root attributes, `QRFrameSVG`, `QRCodeCanvas` and `getQRAsSVG`) through the built package, to static markup with `react-dom/server` and in a DOM (jsdom) with `react-dom`, and both must be React 19's, character for character, with nothing logged by React. Every name the built ES modules import from `react` must be one that version exports, and a small app (`scripts/react-compat/consumer.tsx`) must type-check against its `@types/react`, with `skipLibCheck` off so the package's own `.d.ts` files are checked too. It needs the network, takes about 8 seconds with an empty npm cache and 5 with a warm one, and keeps its install folders when something fails (`--keep` keeps them anyway). After changing the React components, their types or the build, run it yourself:

```bash
bun run --filter qrdx build:inplace
bun run --filter qrdx check:react
```

The official frames (`packages/qrdx/src/frames/official`, hundreds of them) all get their spec, color, layout and generator checks and one crisp decode on every run, but the slow scan checks (the phone-camera model at three distances, 160 and 320 px, the scan score, zbar, PDF and EPS) only go to a sample: the hand-made frames, one frame per layout, and a set that rotates daily so every frame comes round (`packages/qrdx/scripts/official-frames/sample.mjs`). To scan every frame, as the weekly and release `Frame scan` workflow does, set `QRDX_FULL_FRAME_SCAN=1`:

```bash
cd packages/qrdx && QRDX_FULL_FRAME_SCAN=1 bun x vitest run tests/official-frames tests/frame-label-markers.test.ts
cd apps/app && QRDX_FULL_FRAME_SCAN=1 bun x vitest run tests/community/official-frames-gate-1.test.ts tests/community/official-frames-gate-2.test.ts tests/community/official-frames-gate-3.test.ts
```

`QRDX_FRAME_SCAN_DAY=<n>` replays the sample a failing run named ("day n"). `QRDX_FRAME_SCAN_PART=<i>/<n>` checks every n-th frame, starting with the i-th: the workflow runs its parts as parallel jobs, and a failing part can be replayed on its own ("part 2 of 4").

The Husky `pre-push` hook runs `bun run prepush:quick`: the engine build, both typechecks, the lint check and the affected tests, compared with `origin/staging`. Run every test with `QRDX_PREPUSH=full git push` or `bun run prepush`, or skip the hook once with `git push --no-verify`.

To auto-fix formatting, import order and the lint rules that have a safe fix in the files you changed, run this from the repository root:

```bash
bun x ultracite fix <files>
```

### Tests

| Suite | Where | Run |
| --- | --- | --- |
| Unit and integration (Vitest) | `apps/app/tests/**`, `apps/docs/tests/**`, `packages/*/tests` | `bun run --filter app test:unit`, `bun run --filter docs test`, or `bun run test` for the monorepo |
| node:test suites next to the code | `apps/app/**/*.test.ts` outside `tests/` and `e2e/` | `bun run --filter app test:node` |
| Playground e2e | `apps/app/e2e/playground.e2e.ts` | `bun run --filter app test:e2e` |
| Signed-in app e2e | `apps/app/e2e/app.e2e.ts` | `bun run --filter app test:e2e:app` (needs a session cookie, below) |
| Public site e2e | `apps/app/e2e/site.e2e.ts` | `bun run --filter app test:e2e:site` |

`bun run prepush` runs the first two. They need no database, network or email: route handlers run against an in-memory database (`apps/app/tests/support/fake-db.ts`) that evaluates the app's real Drizzle queries. A known bug can be recorded as `it.fails` with a `// BUG (file): …` comment until it's fixed.

Run these through `bun run`. `bun test` is Bun's own test runner, and these Vitest and `node:test` suites aren't written for it.

The e2e suites drive headless Chrome over the DevTools Protocol, so they need Chrome (or `CHROME_PATH`) and a running dev server (`bun run --filter app dev`). They aren't part of `bun run prepush`. Each one exits 0 with a notice when the server or Chrome is missing. `E2E_BASE_URL` points them at another server, and `E2E_SUITES` runs some of their areas, for example `E2E_SUITES=oauth,webhooks` or `E2E_SUITES=image,mcp`.

The app suite signs in with a test account's Better Auth session cookie. Sign in to your local app with a throwaway account, copy the `better-auth.session_token` cookie, and pass it as `E2E_SESSION_COOKIE='better-auth.session_token=<value>'` or put that pair in a file named by `E2E_COOKIE_FILE`. Never commit it. The suite creates codes, a folder, a tag, a hosted page, an OAuth app and (on Business) a webhook, all named `E2E …`, under that account and deletes them again. Webhook URLs only ever point at `https://example.com`.

### Database changes

Edit `packages/database/schema.ts` and apply it to your own development database with `bun run db:push`.

A maintainer applies schema changes to the production database before the code that needs them ships, so the code already running has to keep working against the new schema. That means schema changes are additive and safe to run twice: new columns are nullable or have a default, and a pull request never drops or renames a column or table. Change `packages/database/schema.ts`, and put the SQL a maintainer runs for it in your pull request description, guarded so it can run more than once (`IF NOT EXISTS`).

## Translating QRdx

English is the source, and `packages/i18n/config.ts` lists the languages it's translated into: today `es`, `pt-BR`, `fr`, `de`, `it`, `ja`, `ko`, `zh-Hans`, `id` and `hi`, all machine-translated and waiting for a native review (see [Review and search engines](#review-and-search-engines)).

Translated so far:

- **The playground, AI, MCP and scanner pages.** English keeps the unprefixed URLs (`/playground`), and every other language lives under its own lowercase segment: `/es/playground`, `/pt-br/ai/art`, `/zh-hans/mcp`. These pages are under `apps/app/app/[lang]` and are listed in `paths` in `packages/i18n/localized-paths.json`: the playground, `/ai`, `/ai/art`, `/mcp` and `/scan` (each language's scanner installs as its own app, scoped to `/<segment>/scan`). A dynamic route is listed the way its folder is named (`/qr-code-generator/[type]`). The header, the cookie banner and its dialog, and the sign-in dialog are translated on every one of them, and so is the footer on the AI, MCP and scanner pages (the playground has no footer). Shared theme links (`/playground/<id>`) keep one URL and show the editor in the language menu's language (its cookie). To translate another public page, add its path to that list and move the page's folder from `app/(app)/(home)` to `app/[lang]/(home)`, fixing the imports that pointed at it (`tests/i18n/split-roots.test.ts` fails until the page is in place).
- **Not the marketing pages.** The home page, `/pricing`, the guarantee, enterprise and security pages, tools, generators, industry and placement guides, templates, integrations, plugins, the API, dynamic QR code and open-source pages and the comparison index are English only (the owner's decision, 17 Nov 2026). They still live under `apps/app/app/[lang]`, listed in `englishOnly` in the same file, and render in English at their unprefixed URLs. Their old translated URLs redirect to the English page on QRdx's own hosts (`/es/pricing` → `/pricing`, `/es` → `/`, `/es/home` → `/home`; `packages/i18n/routing.ts`), and links to them never gain a prefix. On those pages the footer's language menu opens the playground in the other languages.
- **The signed-in app.** The dashboard, settings, sign-in and two-step verification, OAuth consent, invitations and join links. Their URLs carry no language: `/dashboard` is `/dashboard` in every language. The language comes from the person: the one they pick in Settings > General > Language (saved on their account), else the language menu's cookie, else English. Server components there read it with `getAppTranslations()` from `apps/app/lib/i18n/app-locale.ts`, not `getTranslations()`, because the URL doesn't say. Messages a server action sends back for the page to show as they are (the errors in "Confirm it's you" and on the session check) follow the same rule: the action translates them with `getAppTranslations()` before answering (`refuse()` in `apps/app/lib/account/confirmation-server.tsx`). English constants such as `CONFIRMATION_MESSAGES` stay the source, each with a helper that returns it from the catalog (`confirmationMessages(t)`, `twoFactorMessages(t)`, `passkeyMessages(t)`) and a test that the catalog's English matches. The app's other actions answer the same way, each area from its own server-only namespace, read only when the action has something to say, with English as the fallback:
  - `workspaceActions`: workspace and team (`apps/app/lib/i18n/workspace-actions.ts`);
  - `codeActions`: codes, folders, tags and bulk actions, pages, files, domains, analytics, webhooks (`codeActionText()` in `apps/app/lib/code-actions/messages-server.ts`; what `organize.ts` throws for folders, tags and bulk actions is said again by `runOrganize`, with `OrganizeValidationError` carrying a folder's or tag's name);
  - `communityActions`: publishing to the community, themes, the code builder, search (`communityActionText()` in `apps/app/lib/community/action-text.ts`);
  - `settingsActions`: Settings (`settingsActionText()` in `apps/app/lib/i18n/settings-action-text.ts`), including what the notification settings refuse with (`NotificationSettingsError` in `apps/app/lib/events/notification-settings.ts`, which carries the plan a refusal needs, so the upgrade offered never depends on the words).

  Keep these namespaces out of the lists in `apps/app/lib/i18n/playground.ts`: only the server reads them. Each area keeps its English in constants, with a test that the catalog matches. A helper that throws for an action to report throws an error whose message stays English, for logs and the REST API, and the action reads it again in the person's language (`WorkspaceActionError`, `CheckError`).

  Actions that pages under `app/[lang]` also call can't tell the page's language from the request. These are the editor's publish, import and like actions, saving a theme, and the code builder, which opens over `/[lang]/playground`. Their client components pass next-intl's `useLocale()` with the call, and the action answers through `actionText()` in `apps/app/lib/i18n/action-locale.ts`: the language sent when `isLocale()` accepts it, otherwise the app's rule. `tests/i18n/action-locale-callers.test.ts` and `tests/i18n/code-action-locale-callers.test.ts` check that every client call passes it.

  Actions that only English pages call answer in English: pricing's checkout, non-profit and invoice requests, the enterprise form, the single sign-on, audit log and client portal settings, linking a Slack account, applying on `/affiliates`, the community gallery and `/report-abuse`. Messages that shared services throw (codes, pages, domains, files, OAuth apps, API keys) still pass through in English.
- **Emails.** Each email is in the language of whoever reads it, picked in `apps/app/lib/i18n/email-locale.ts`:
  - The sign-in code, the new-address code and the "Confirm it's you" code: the recipient's saved language, else the language the site was in when they asked for the code, else English.
  - Team and client-portal invitations: the invitee's saved language when the address has an account, else the inviter's language (they're sent from the inviter's own request; an invitation resent from admin falls back to English), else English.
  - The security notices (a new sign-in, a passkey added or removed, a two-step verification change, a new PayPal payout address, and the notice to the old address after an email change): the account's saved language, else English, never the language of the request that set them off. That request may not be the owner's, which is why the notice is sent (`emailIntlForAddress(email, { fromRequest: false })`, or `emailIntlForUser(userId)` when the sender has the account's id). The device and place they show are in the email's language too.
  - Personal notes from the team (sent from QRdx's console, `apps/app/lib/email/personal-notes.tsx`): the text as its writer wrote it, with the footer in the recipient's saved language, else English.
  - Free's first-scan email, once per code (`apps/app/lib/email/first-scan.tsx`): the code maker's saved language, else English.
  - The welcome email (`apps/app/lib/email/welcome.tsx`, after sign-up): the account's saved language, which sign-up sets to the site's language at the time, else English. Pro's price in it is in the sign-up's currency.
  - The first scan, scan milestone, form response and code activity alerts, plan-limit notices and the weekly digest: each recipient's saved language, else English. They're sent after someone else's request (a scan, a form response, a teammate's edit) or on a schedule, so no request's language menu cookie counts. When a workspace's owners chose different languages, a limit notice goes out once per language.

  Templates (`packages/email/templates`) take an `intl` (`apps/app/lib/i18n/email.ts`): `ENGLISH_EMAIL`, or the recipient's language from the helpers above.

The docs, the blog, the legal pages, the comparison pages themselves and admin are English only (see [Docs](#docs) below), and so are the emails to QRdx's own team (enterprise, non-profit and invoice requests).

The copy is in `apps/app/messages/`:

| File | What it holds |
| --- | --- |
| `en.json` | The English source: every key, with ICU placeholders such as `{count}` |
| `<locale>.json` | One language's translations of those keys. A missing key shows in English |
| `review/<locale>.json` | For each translated string, a hash of the English it came from and its status, `machine` or `reviewed` |
| `glossary.json` | Names that are never translated (`keep`), fixed translations per language (`fixed`) and each language's tone (`register`) |
| `content/<locale>.json` | Translations of copy that lives in TypeScript data (generator pages, industry and placement guides, FAQ lists), keyed by a hash of the English, with the English beside each one |

Long copy kept in TypeScript (for example `lib/qr-types-content.ts`, `lib/seo-content`, a page's `content.ts`) stays English in its file. `apps/app/lib/i18n/content-sources.ts` lists that data, the translate script fills `content/<locale>.json` from it, and pages render it with `localizeContent()` (client components with `useContentText()`). A string is looked up by its English, so when the English changes it shows in English until it's translated again.

New interface copy goes into `en.json` and is read with next-intl's `t()`. `bun run --filter app i18n:extract <files>` (paths from `apps/app`) does most of that for a component: it moves JSX text, copy props such as `aria-label` and `placeholder`, and toast messages into `en.json` and swaps them for `t()` calls. Add `--app` for the signed-in app's server components and `--dry-run` to see the changes first. Copy it can't convert, such as module-level data, is listed for you to move by hand.

The docs site (`apps/docs`) is English only and loads the English namespaces it reads (`docs`, `footer`, `meta` and `consent`) through `@repo/i18n`, from a copy that `bun run --filter app i18n:docs-messages` writes to `packages/i18n/messages/en.json` right before that app builds. The copy isn't committed, so there's nothing to refresh by hand. The `docs` key holds the docs' own interface strings: it stays out of the other catalogs, and the translate script and `i18n:check` skip it.

### Add a language

Open an issue first, so two people don't start the same language. A new language touches these files and nothing else:

1. `packages/i18n/config.ts`: one entry in `LOCALE_CONFIG`. The key is the BCP 47 code (`nl`, `zh-Hant`). Give it the lowercase URL `segment`, its `name` written in the language itself, its `englishName`, the `hreflang` values, `ogLocale`, `dir` (`"rtl"` for Arabic, Hebrew or Persian) and `review: "machine"`.
2. `apps/app/messages/<code>.json`: the translations. It can start as `{}`, and a partial file is fine to merge, because untranslated strings show in English.
3. `apps/app/messages/review/<code>.json`: written by the translate script (below). Don't edit the hashes by hand.
4. `apps/app/messages/glossary.json` (optional): the language's fixed terms under `fixed`, such as the Free plan's name, and its tone under `register`.

Routes, the language menu, `<html lang>` and `<html dir>`, page metadata and the sitemap read the config, so nothing else needs editing. A right-to-left language renders with `dir="rtl"`, but the layout hasn't been converted yet (logical CSS properties, mirrored icons, a font for the script). That work has its own issue.

### Translate

By hand: copy the keys you're translating from `en.json` into `<code>.json`, keeping the same nesting. Then record them, so a later change to the English shows up as stale:

```bash
bun run --filter app i18n:translate --locale <code> --record
```

With a model: the script translates missing and stale strings through Vercel AI Gateway. Each request carries the glossary, the key, the page the string appears on and a length budget for short labels. The script checks every answer and keeps the English for any that fail. QRdx's gateway key isn't shared, so use your own:

```bash
AI_GATEWAY_API_KEY=<your key> bun run --filter app i18n:translate --locale <code>
I18N_MODEL=<gateway model id> AI_GATEWAY_API_KEY=<your key> bun run --filter app i18n:translate --locale <code>
```

It translates both catalogs; `--only ui` or `--only content` picks one, `--concurrency <n>` sets the requests at a time (3 by default) and `--prune` drops content translations no page uses any more. Work is saved after every request, so an interrupted run keeps what it finished.

Read the result before you open the pull request. Machine output gets the same review as a hand translation.

The rules for every string:

- Keep placeholders and tags exactly as they are (`{count}`, `{count, plural, one {…} other {…}}`, `<link>…</link>`) and translate only the words around and inside them.
- Keep every number the English states, written in Western digits. Add no feature, number, promise or adjective the English doesn't have.
- Leave the names in the glossary's `keep` list in English: QRdx, Pro, Business, Never-Hostage, file formats and product names. The Free plan's name is translated.
- Follow the language's `register`, and keep buttons and labels about as short as the English.
- Legal pages stay in English, and links to them stay as they are.

### Check

```bash
bun run --filter app i18n:check             # CI runs this
bun run --filter app i18n:check --verbose   # also lists missing, unrecorded and stale strings
```

It fails on keys that English doesn't have, on placeholders or tags that changed, and on numbers that went missing. In a language that isn't reviewed yet, missing and stale strings only produce warnings. Also open `/<segment>/playground` and `/<segment>/ai` and attach screenshots at 1440 px and 390 px to the pull request; long German or Finnish words are the usual overflow.

### Docs

The docs (`apps/docs/content/docs`) are English only: one `<page>.mdx` a page and one `meta.json` a folder, served at `/docs/...`. They aren't translated, so don't add `<page>.<code>.mdx` or `meta.<code>.json` files (a test in `apps/docs` fails on them), and there is no docs translation script or review record.

Until 17 November 2026 the docs were also served in the other languages, under `/es/docs/...`, `/pt-br/docs/...` and so on. Those URLs, their `.md` and `.mdx` copies and `/docs-md/<language>/...` now redirect to the same page in English, keeping the path and the query (`translatedDocsRedirects` in `packages/i18n/docs.ts`, used by both apps' `next.config.ts`). The redirect is permanent (308) on a deployment that serves the docs itself, and temporary (307) on one that sends them to qrdx.dev. A new language in `packages/i18n/config.ts` gets the same redirect for its `/<segment>/docs` URLs.

A link to a docs page is written as its English URL (`/docs/...`) everywhere, on translated pages too: `localizeHref` leaves docs paths alone.

The docs assistant (Ask AI in the docs) and the MCP server's `search_docs` and `read_docs_page` tools read the English pages. The assistant answers in the language the question is written in.

### Review and search engines

A language with `review: "machine"` is live on the site but hidden from search engines. Its pages are `noindex`, they're left out of the sitemap, and no page links to them with hreflang. To publish a language, a native speaker reads every string, sets each one's `status` to `"reviewed"` in `review/<code>.json`, and changes the language's `review` to `"reviewed"` in the config. From the next deploy its pages are indexed, listed in the sitemap and linked with hreflang. `i18n:check` then fails on any string in that language that is missing, machine-made or stale. To publish single pages first, set `review` to a list of paths, such as `["/playground", "/ai"]`.

A review can also cover part of a language, such as the header, footer, cookie banner, sign-in and emails. Then mark only the strings you read `"reviewed"` and leave `review` in the config as it is: the work is recorded, and nothing is published until the rest of the language's strings are reviewed too. `bun run --filter app i18n:review <code> <key prefix>...` marks every string under the prefixes you name, for example `bun run --filter app i18n:review es nav footer`. `i18n:check` counts the reviewed strings on the language's line.

## Pull requests

- Open pull requests against `staging`, not `main`. Changes collect on `staging`; a workflow keeps a release pull request from `staging` to `main` up to date, and merging that one releases to `main`. Production deploys `main` in batches: `.github/workflows/production-deploy.yml` checks every 6 hours (00:17, 06:17, 12:17 and 18:17 UTC) and, when `main` has moved, has Vercel build it, then deploys the marketing site and the console (built from a private repository) when theirs moved, deploys the docs site when its inputs changed, and posts the release to Discord and the search engines. A push creates no Vercel deployment by itself (`apps/app/vercel.json`), because each deployment is billed. To ship something now, run the workflow from the Actions tab.
- Keep each pull request focused on a single change.
- Use a [Conventional Commits](https://www.conventionalcommits.org/) style title, for example `feat(editor): add frame presets` or `fix(cli): handle missing sharp`.
- Fill in the pull request template. For UI changes, include before and after screenshots at 1440 px and 390 px wide, in light and dark mode.
- Keep secrets out of code, tests, screenshots and logs: no `.env` values, tokens or session cookies. Tests use the fakes in `apps/app/tests/support/`.
- Copy on the site goes live as written, so no placeholders or "TBD". Product counts come from code (`apps/app/lib/product-facts.ts` and the catalogues), not typed by hand.
- Update the docs (`apps/docs/content/docs`) or package READMEs when you change behavior or public APIs.
- Make sure the checks above pass. A maintainer reviews every pull request before it's merged.
- Sign the [contributor license agreement](#contributor-license-agreement) when the bot asks on your first pull request.

## Contributor license agreement

Before your first pull request can be merged, you sign the [QRdx Contributor License Agreement](CLA.md) (CLA). You keep the copyright in what you contribute. The CLA gives QRdx a license to use your work and to license it to others on any terms, including commercial ones, plus a matching patent license.

When you open your first pull request, the CLA Assistant bot comments on it with a link. Follow it, sign in with GitHub and accept. One signature covers your later pull requests too. If you contribute as part of your job, your employer can also sign for the people it authorizes; CLA.md says how.

We ask because QRdx is open core: most of the repository is AGPL-3.0-or-later or MIT, and the `ee/` folders are under the QRdx Commercial License. The CLA lets QRdx move your code into a commercial feature or change its license later, which the folder licenses alone don't allow. Your contribution is still released under the license of the folder it goes into ([LICENSING.md](LICENSING.md) lists them), so everyone else can keep using it on those terms.

Pull requests from bots, such as Dependabot and GitHub Actions, don't need a signature.

## Good first issues

Issues labeled [`good first issue`](https://github.com/qrdxinc/qrdx/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) are small and self-contained, and [`help wanted`](https://github.com/qrdxinc/qrdx/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) marks bigger ones where help is welcome. Comment on the issue before you start, so two people don't build the same thing. The `area: …` labels tell you which part of the repository an issue is about.

When nothing is open under those labels, docs fixes are a good first pull request: the **Open** menu under each docs page's title has **Open in GitHub**, which takes you to the page's source in `apps/docs/content/docs`. Or ask in [Q&A](https://github.com/qrdxinc/qrdx/discussions/categories/q-a) what would help most.

By contributing, you agree to the [contributor license agreement](#contributor-license-agreement) and to follow the [Code of Conduct](.github/CODE_OF_CONDUCT.md).
