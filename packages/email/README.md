# @repo/email

QRdx's emails: the templates and their layout (React Email), rendering, and sending through Resend. The main app binds the sender to its environment and delivery guard in `apps/app/lib/email/send.ts` and imports the templates from here. Preview them with `bun run --filter email dev` (`apps/email`, http://localhost:3003).

| Module | What it holds |
| --- | --- |
| `index.ts` (`@repo/email`) | `createEmailSender({ apiKey, from, isDeliveryAllowed })`: `sendEmail()` (which takes another `from` per email) and `isEmailConfigured`. Never throws unless asked; skips and logs without a key or sender, where delivery isn't allowed, and for reserved test addresses; sends the HTML and plain-text bodies, tags, idempotency keys and one-click List-Unsubscribe headers |
| `render.ts` | `renderEmail()`: a template's HTML and plain text |
| `reserved-address.ts` | `isReservedEmailAddress()`: RFC 2606 and 6761 names (`@qrdx.test`, `example.com`), which never get email |
| `intl.ts` | `EmailIntl`, the language every template takes |
| `origin.ts` | `baseUrl`, the origin the templates link to (the app's, resolved as the app resolves it) |
| `keys.ts` | `RESEND_API_KEY`, `EMAIL_FROM` and `EMAIL_FROM_PERSONAL` (the sender of personal notes), validated like every other `keys.ts`; `apps/app/env.ts` extends it |
| `templates/` | One file per email, plus `layout.tsx` (the frame QRdx's own emails share, with its heading, text, button, link fallback, code box and divider), `personal-layout.tsx` (the plain frame of an email a person on the team writes, such as `personal-note.tsx`), `parts.tsx` (details table, stat box, ranked list, muted text) and `security-parts.tsx` |

## Templates and their language

The copy is in the app's catalogs (`emails` in `apps/app/messages/<locale>.json`), translated with the rest of the app. This package can't import the app, so every template takes an `intl`: the locale and a translator the app makes (`ENGLISH_EMAIL`, or `emailIntl(locale)` in `apps/app/lib/i18n/email.ts`). The app declares its catalog's shape for this package (`apps/app/types/email-intl.d.ts`), so a wrong key or a missing argument in a template fails the app's typecheck. This package's own typecheck accepts any key.

Each template sets `PreviewProps`, the example the preview server renders. They use example names and reserved addresses only.

The frame's logo is a PNG the app serves, `apps/app/public/email/qrdx-logo.png` (the mark and wordmark at 2×), linked from `baseUrl`, so emails show it wherever the app runs.
