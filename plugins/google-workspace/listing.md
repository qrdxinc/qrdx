# Google Workspace Marketplace listing

The copy and settings for the add-on's store listing (Google Cloud console → Google Workspace Marketplace SDK → Store Listing). It describes only what the add-on in this folder does. Change it here first if the add-on changes.

## App details

**Application name** (50 characters at most; must match the OAuth consent screen's app name and the manifest's `addOns.common.name`):

> QRdx – QR Code Generator

**Short description** (200 characters at most; this is 159):

> Add styled QR codes to Docs, Slides and Sheets: links, text, Wi-Fi, email, phone and SMS. Fill a column with =IMAGE() codes in Sheets. Free, no account needed.

**Detailed description:**

> Make a QR code without leaving your document. Open QRdx from the side panel in Google Docs, Slides or Sheets, choose what the code does, pick a style and a size, and insert it.
>
> What a code can do:
> - Open a link
> - Show a piece of text
> - Join a Wi-Fi network (WPA/WPA2, WPA3, WEP or open)
> - Start an email with the address, subject and message filled in
> - Call a phone number
> - Start a text message (SMS) with the message filled in
>
> Where it goes:
> - Docs: at your cursor
> - Slides: in the middle of the current slide
> - Sheets: over the sheet at the selected cell
>
> The code is saved in your file as an image, at 1, 1.5 or 2 inches, sharp enough to print. It gets alt text, and a link code in Docs or Slides is also a clickable link. Preview shows the code in the side panel first, so you can scan it with your phone before you insert it.
>
> For a list in Sheets, select a column of links or text and QRdx fills the next column with =IMAGE() formulas, one code per row, sized to fit. Those codes follow their cells: edit a link and its code changes. Sheets loads them from QRdx's image API rather than saving them in the file.
>
> Six styles: Classic (round dots), Plain squares, Blue, Slate, Green and Coffee. Each is dark on light and checked to scan.
>
> Privacy: QRdx draws each code with its free image API at api.qrdx.dev, so the code's content, a Wi-Fi password included, travels in that request. QRdx doesn't store it in a database; like any web address, the request can show up in server logs and caches. The add-on reads only where to put the code (your cursor, slide or selected cells), never your file's text, and keeps nothing: no account, no storage, no analytics.
>
> Need to change the link after printing, or count scans? Make a dynamic code at qrdx.dev.
>
> QRdx is an open-source QR code platform. The add-on's code is MIT-licensed: github.com/qrdxinc/qrdx/tree/main/plugins/google-workspace

**Category:** the closest the console offers, such as Productivity or Utilities.

**Pricing:** Free of charge.

**Language:** English.

## Graphics

| Asset | Size | File |
| --- | --- | --- |
| Application icon | 32 × 32 | `assets/icon-32.png` |
| Application icon | 128 × 128 | `assets/icon-128.png` |
| Card banner | 220 × 140 | `assets/card-banner.png` |
| Screenshots | 1280 × 800, 1 to 10, full bleed, square corners | Take them from a test deployment (none yet; at least one must show the add-on inside a Google app) |

Screenshots to take, each with its caption:

1. Docs, a Wi-Fi code inserted at the cursor in a sign: "Wi-Fi, links, email, phone and SMS codes, inserted at your cursor."
2. Slides, a link code in the middle of a slide, Preview visible in the side panel: "Preview it, then add it to your slide."
3. Sheets, a column of links with codes in the next column: "A column of links becomes a column of codes."
4. The style dropdown open: "Six styles, all dark on light and checked to scan."

## Links

| Field | URL | Checked |
| --- | --- | --- |
| Terms of service | https://qrdx.dev/legal/terms-of-service | 200 on 23 Nov 2026 |
| Privacy policy | https://qrdx.dev/legal/privacy-policy | 200 on 23 Nov 2026 |
| Support | https://qrdx.dev/docs/help/contact | 200 on 23 Nov 2026 (`/support` redirects there) |
| Developer website | https://qrdx.dev | |
| Developer email | support@qrdx.dev | |

The privacy policy doesn't mention the add-on by name yet. Add the section drafted in PUBLISHING.md before submitting.
