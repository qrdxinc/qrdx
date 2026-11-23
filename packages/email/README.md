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
| `templates/` | One file per email, plus `layout.tsx` (the frame QRdx's own emails share, with its heading, text, button, link fallback, code box and divider), `personal-layout.tsx` (the plain frame of an email a person on the team writes, such as `personal-note.tsx`), `parts.tsx` (details table, stat box, ranked list, text link, muted text) and `security-parts.tsx` |

## The look

QRdx's own emails share one calm frame, `EmailLayout` (`templates/layout.tsx`): a white page with one bordered card, 600 px wide at most, the logo on top, an 18 px heading, 14 px text, one black button and a quiet footer inside the card. The footer says who the email was meant for (`recipient`, the address it's sent to: every template takes it, and the app passes it whenever the email goes to a person, not on the requests that go to the QRdx team), why it came (`reason`), how to stop it (`unsubscribeUrl`, or `settingsUrl` for the page where that kind of email is switched off) and the QRdx line. With `sender`, a workspace's name heads the email instead of the logo. Colours are near-black text, grey for anything secondary, light grey lines and one blue accent for plain links; there's no grey page, coloured border or icon.

Build an email from the pieces rather than styling it by hand:

- `layout.tsx`: `EmailHeading`, `EmailText`, `EmailButton` (left aligned, brings its own spacing), `EmailLinkFallback` (the button's URL to copy and paste, under the button), `EmailCode` (a one-time code in a box), `EmailDivider`, and the colour tokens.
- `parts.tsx`: `DetailsTable` (label and value rows in one box), `StatGrid` (a few numbers in one box), `RankedList` (a header row, then names with their counts), `EmailTextLink` (a link inside a sentence), `MutedText` (expiry notes and small print) and `SectionTitle`. Their rows read as columns in the plain-text body.

An email a person on the team writes (`personal-note.tsx`, sent from the console) uses `PersonalLayout` instead: no card, logo or button, the same type, signed with the writer's name unless the text already ends with it, and a short footer with who it was meant for, why it came, that a reply reaches the writer, how to stop these notes and the QRdx line. It should read like a short letter in any inbox.

## Templates and their language

The copy is in the app's catalogs (`emails` in `apps/app/messages/<locale>.json`), translated with the rest of the app. This package can't import the app, so every template takes an `intl`: the locale and a translator the app makes (`ENGLISH_EMAIL`, or `emailIntl(locale)` in `apps/app/lib/i18n/email.ts`). The app declares its catalog's shape for this package (`apps/app/types/email-intl.d.ts`), so a wrong key or a missing argument in a template fails the app's typecheck. This package's own typecheck accepts any key.

Each template sets `PreviewProps`, the example the preview server renders. They use example names and reserved addresses only.

The frame's logo is a PNG the app serves, `apps/app/public/email/qrdx-logo.png` (the mark and wordmark at 2×), linked from `baseUrl`, so emails show it wherever the app runs.
