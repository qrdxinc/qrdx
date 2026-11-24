# QRdx for Canva

A [Canva app](https://www.canva.dev/docs/apps/) that adds a styled QR code to your design, built with the [`qrdx`](../../packages/qrdx) library. It isn't in Canva's app marketplace, so you run it from source as a development app.

Enter a URL or text, pick dot, eye and eye-dot patterns, colors, an error correction level and an optional logo URL, then click **Add to Design**. The code goes into the design as a PNG image with alt text. **More options in the QRdx playground** opens the full editor at qrdx.dev, after Canva asks you to confirm. A web address goes along; plain text, colors, patterns and the logo stay in Canva.

## Run from source

You need Node.js 22 (22.22.3 or later), [Bun](https://bun.com/docs/installation) 1.4 and a Canva account.

1. From the root of this repository, install and build the engine, which the app imports from `packages/qrdx/dist`:

   ```bash
   bun install
   bun run --filter qrdx build:inplace
   ```

2. Create an app in Canva's Developer Portal and set its development URL to `http://localhost:8080`. Canva's [quickstart](https://www.canva.dev/docs/apps/quickstart/) shows where.
3. Start the development server, which serves the app bundle on port 8080:

   ```bash
   bun run --filter @qrdx/canva-plugin start
   ```

4. Preview the app from the Developer Portal.

`bun run --filter @qrdx/canva-plugin build` writes the production bundle to `plugins/canva/dist/app.js`, a single file as Canva requires, and the app's English strings to `plugins/canva/dist/messages_en.json`.

## Translations

Every string the app shows goes through [`react-intl`](https://formatjs.github.io/docs/react-intl/), and `AppI18nProvider` from `@canva/app-i18n-kit` loads Canva's translations for the user's language. Write new strings as `FormattedMessage` (or `useIntl().formatMessage()` where a plain string is needed) with an English `defaultMessage` and a `description` that tells the translator where the text appears. Don't give them an `id`: the build makes one from the text, and `bun run --filter @qrdx/canva-plugin extract` writes the same IDs to `dist/messages_en.json`. The brand name, web addresses, hex colors and the error correction letters L, M, Q and H aren't translated.

When you upload a new version in the Developer Portal, upload `dist/app.js` and, under **Code upload** > **Translations**, `dist/messages_en.json` from the same build. Canva translates the strings; you can't upload your own translations.

## License

[MIT](LICENSE)
