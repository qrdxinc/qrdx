# QRdx for Google Docs, Sheets and Slides

A Google Workspace add-on that puts styled QR codes into Docs, Sheets and Slides. One Apps Script project covers all three. It isn't on the Google Workspace Marketplace yet; [PUBLISHING.md](PUBLISHING.md) lists the steps to get it there, and [listing.md](listing.md) has the listing copy.

- **Content:** a link, plain text, a Wi-Fi network, an email, a phone call or a text message (SMS). The add-on builds the same payloads as QRdx's MCP server and editor, so a Wi-Fi code joins the network and an email code opens a filled-in message.
- **Look:** six styles drawn by QRdx's [image API](https://qrdx.dev/docs/developers/image-api) (Classic, Plain squares, Blue, Slate, Green, Coffee), all dark on light, each checked to decode with zbar. Three sizes: 1, 1.5 and 2 inches.
- **Insert:** Docs puts the code at the cursor, Slides puts it in the middle of the current slide, Sheets places it over the grid at the current cell. The image is fetched once and saved in the file, so the file doesn't depend on QRdx afterwards. Each image gets alt text ("QR code to join the Wi-Fi network Home"; never a password), and in Docs and Slides a link code is also a clickable link.
- **Codes for a list (Sheets):** select one column of links or text and the add-on writes `=IF(A2="","",IMAGE("https://api.qrdx.dev/v1/qr?…&data="&ENCODEURL(A2)))` in the next column, then sizes the rows and the column. These cells load their codes from the API rather than from the file; the sidebar says so before you click. It refuses to write over cells that hold anything, and takes up to 500 rows at a time.
- **Preview** shows the code in the sidebar before you insert it.
- One line at the bottom points to dynamic codes on qrdx.dev (change the link after printing, count scans). The link carries `ref=google-workspace-addon`, so a sign-up that follows counts for the plugin channel in QRdx's analytics.

There is no QRdx account connection in this version: every code is a static code from the keyless image API.

## Files

| File | What it is |
| --- | --- |
| `src/appsscript.json` | The manifest: scopes, the fetch allowlist, the add-on's name, logo and colour, and the homepage trigger for Docs, Sheets and Slides |
| `src/main.js` | The sidebar card (Card service), the entry points and the code that places images and writes formulas |
| `src/payload.js` | The content of each code type (`WIFI:`, `mailto:`, `tel:`, `sms:` and links) |
| `src/image-url.js` | The styles, sizes, image addresses, `=IMAGE()` formulas and API error messages |
| `test/` | `node:test` suites; `test/load.mjs` runs `src/*.js` the way Apps Script does |
| `assets/` | Marketplace icons (32 and 128 px) and the 220 × 140 card banner, made from `apps/app/public/logo.png` |
| `.clasp.example.json` | The clasp project file without an id; copy it to `.clasp.json` (ignored by git) |

`src/payload.js` and `src/image-url.js` are plain JavaScript with no imports and no `URL`, `URLSearchParams` or `TextEncoder`, because Apps Script has none of them. Apps Script runs every file in one global scope, in an order it doesn't promise, so no file uses another file's names while it loads.

## Tests

```bash
bun run --filter @qrdx/google-workspace-addon test
```

`test/syntax.test.mjs` parses `src/` as ES2020, the newest syntax Apps Script's parser takes (a `clasp push` rejected numeric separators, ES2021, so Biome's `useNumericSeparators` is off for `src/`); run the tests before every push.

`test/addon.test.mjs` loads the sources with fakes of the Card, UrlFetch, Document, Slides and Spreadsheet services and runs every entry point: the card's fields and buttons, the request sent to the API, the size, position, alt text and link of each inserted image, the formulas and the refusals. `apps/app/tests/plugins/google-workspace.test.ts` holds the add-on's copies to the app: each style's address against the image API's query schema, the payloads against the MCP server's builders and the editor's encoders, and the analytics tag against the plugin channel.

Apps Script itself can't run on your machine, so the fakes are only as right as our reading of Google's reference. Before a release, run the manual test plan below on a test deployment.

## Manual test plan

Install a test deployment ([PUBLISHING.md](PUBLISHING.md), step 6), then:

| # | Where | Do | Expect |
| --- | --- | --- | --- |
| 1 | Docs | Open the side panel, click QRdx | Google asks for permission once; the card shows "The code opens", Link, Style, Size and "Insert at cursor" |
| 2 | Docs | Link `example.com`, Preview | A code appears under Preview; your phone opens https://example.com |
| 3 | Docs | Click in a paragraph, Insert at cursor | "QR code inserted."; a 1.5 in image at the cursor; Alt text shows "QR code for https://example.com"; clicking the image offers the link |
| 4 | Docs | Select a word (no plain cursor), Insert | "Click in the document where the code should go…"; nothing inserted |
| 5 | Docs | Wi-Fi, a real network, WPA, Insert | A phone that scans it offers to join; the alt text has the network name and no password |
| 6 | Docs | Email to your address with a subject and two-line message | Scanning opens a new email with all three filled in |
| 7 | Docs | Text with 2,100 characters | "That's 2100 characters; a code holds at most 2048…" |
| 7b | Docs | Classic style, Text with 2,000 digits; Preview, then Insert at cursor | Both say "This is too long for the add-on: Google limits the image's web address to 2,000 characters, and this content needs 2,084 once encoded…"; nothing inserted |
| 8 | Slides | Link, size Large, Add to slide | A 2 in code in the middle of the current slide, selected |
| 9 | Slides | Phone and SMS codes | Scanning offers to call, or to text with the message filled in |
| 10 | Sheets | Select C5, Insert over sheet | "QR code placed over cell C5."; the image sits over C5 |
| 11 | Sheets | Links in A2:A6, select A2:A6, Add =IMAGE() formulas | "Added 5 codes in column B…"; B2:B6 show codes; rows and column B are sized; editing A3 changes B3's code; an empty A cell leaves its B cell empty |
| 12 | Sheets | Put text in B4 and repeat 11 | "Column B already has something in 1 of these rows…"; nothing written |
| 13 | Sheets | Select A1:B3 and add formulas | "Select cells in one column…" |
| 14 | Any | Make a dynamic code | qrdx.dev/dynamic-qr-code opens in a new tab with `ref=google-workspace-addon` and the `utm_` tags |
| 15 | Any | The add-on's menu: Privacy policy, Get help | qrdx.dev/legal/privacy-policy and qrdx.dev/docs/help/contact open |
| 16 | Apps Script | Executions page after the runs above | No failed runs |

Steps 8–13 also confirm that the `presentations.currentonly` and `spreadsheets.currentonly` scopes are enough. Google's own sample add-on asked for the full `presentations` and `spreadsheets` scopes; if Slides or Sheets refuses with an authorization error, that's the place to look.

## Scopes

| Scope | Classification | Why |
| --- | --- | --- |
| `documents.currentonly` | Not sensitive | Docs: read the cursor and insert the image, in the open document only |
| `presentations.currentonly` | Not sensitive | Slides: read the current slide and the page size, insert the image |
| `spreadsheets.currentonly` | Not sensitive | Sheets: read the current cell or selection, check the next column is empty, insert the image or write the formulas and set row heights and column width |
| `script.external_request` | Sensitive | Fetch the PNG from `api.qrdx.dev`. `urlFetchWhitelist` limits it to `https://api.qrdx.dev/v1/qr` |

The `currentonly` scopes reach only the file the add-on is open in, and only through Apps Script's own Document, Slides and Spreadsheet services. They aren't sensitive, so they need no verification on their own. `script.external_request` is the one sensitive scope: Google's OAuth verification reviews it before the add-on can go past 100 users. Nothing narrower can bring the image into a Doc, because Docs inserts images only from a blob, and a blob from another site needs `UrlFetchApp`. The other way out would be drawing the code inside Apps Script, which would mean no styles; we kept the API. There is no Drive scope, no `drive.file`, no access to other files, no user info and no `script.container.ui` (the add-on uses cards, not HTML).

## Privacy

What leaves the user's file, and what QRdx gets:

- **What the add-on sends.** When you click Preview or Insert, the add-on asks `https://api.qrdx.dev/v1/qr` for a PNG. The code's content (the link, text, Wi-Fi name and password, email fields or phone number you typed into the side panel) is in that request's address, in the `data` parameter, along with the style and size. Google's Apps Script servers make the request, so QRdx sees a Google IP address, not yours. Nothing else from your file is sent.
- **What QRdx does with it.** The image API draws the code and returns it. QRdx's code doesn't save the content: it adds one to a daily count of image API requests (no content, no address) and keeps a rate-limit counter for the requesting IP address, which expires on its own (the [privacy policy](https://qrdx.dev/legal/privacy-policy) has the retention). QRdx's host, Vercel, processes the request to deliver it. Like any web address, the request's address can appear in the host's request logs and caches: image responses are marked cacheable for a year, because the same address always draws the same code.
- **Formulas in Sheets.** With **Add =IMAGE() formulas**, the add-on itself sends nothing. Google Sheets requests each code from `api.qrdx.dev` through Google's servers, with that cell's text in the address, whenever it loads the images.
- **What the add-on reads from your file.** Where to put the code: the cursor in Docs, the current slide and page size in Slides, the current cell or the selected range in Sheets, and, before writing formulas, the values and formulas of the cells it would fill, to check they're empty. It doesn't read your file's text.
- **What it keeps.** Nothing. No storage (`PropertiesService` and the like), no logs (`exceptionLogging` is `NONE`, and the code has no `console` calls), no analytics, no account.
- **The qrdx.dev link.** "Make a dynamic code" opens `https://qrdx.dev/dynamic-qr-code?ref=google-workspace-addon&utm_source=google-workspace&utm_medium=addon&utm_campaign=sidebar` in a new tab, only when clicked. It carries no content.

The qrdx.dev privacy policy covers the image API in general ("use the Image API, where the content is part of the request"). Google's OAuth verification also wants the policy to say how the add-on uses Google user data; PUBLISHING.md has a draft section for that.

## Deploy with clasp

Under the Google account that owns Cloud project `qrdx-491208` (the owner's second Google account). [PUBLISHING.md](PUBLISHING.md) has the full order, including the consent screen and the Marketplace.

```bash
cd plugins/google-workspace
bunx @google/clasp login                 # pick the account that owns qrdx-491208
cp .clasp.example.json .clasp.json       # then paste the script id into "scriptId"
bunx @google/clasp push --force          # uploads src/ (the manifest and the three .js files)
```

Create the Apps Script project at https://script.google.com first (New project), and copy its id from Project Settings. `--force` replaces the project's default manifest with `src/appsscript.json`. `.clasp.json` and `.clasprc.json` are git-ignored.

## Follow-ups

- **A QRdx account in the side panel**, to make dynamic codes and use uploaded logos, once QRdx's OAuth sign-in for agents and apps lands. It would add a scope and an account connection, and change the privacy notes above.
- Translations: the card is English only (`useLocaleFromApp` is off).
- Frames with a label ("Scan me") and logo icons: the image API draws them, the card doesn't offer them yet.
- A Google Workspace card on qrdx.dev/plugins once the listing is live.

## License

[MIT](LICENSE)
