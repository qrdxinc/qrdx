# QRdx for Figma

A Figma plugin that inserts styled QR codes as vector layers, built with the [`qrdx`](../../packages/qrdx) library. Its first Figma Community release was submitted for review on 23 Nov 2026. Until it's live, build it and import it from source, as [Import for development](#import-for-development) describes.

- Enter a URL or any text, pick one of 12 style presets (the same ones as the Chrome extension, taken from the QRdx playground), adjust the foreground and background colors, and choose a size (32 to 4096 px).
- **Insert QR code** adds a frame named `QR – <value>` at the center of the viewport, selects it and zooms to it. It is made of editable vector layers, so it stays sharp at any zoom.
- Every inserted code remembers its content and style (plugin data). Select one and the plugin offers **Replace selected QR**, which swaps in the new code while keeping the old one's on-canvas size, position, rotation, constraints and layer order. **Load its settings** copies the selected code's content and style into the form.
- Inserted codes get an **Edit QR code** button in Figma's right panel that reopens the plugin with that code's settings loaded. Figma shows the button only for a plugin with an id (`manifest.json` has the Community plugin's); without it, select the code and run the plugin to load its settings or replace it.
- Follows Figma's light or dark theme. Warns when content is too long, when colors have low contrast, and when a code is light on dark.
- **More options in the QRdx playground** opens the full editor at qrdx.dev in your browser, with the code's web address filled in. The Classic and Minimal presets go along too; the other ten have changed in the playground since they were copied, so they don't.

## How it works

`src/ui.tsx` (the plugin window) renders the SVG with `qrdx` and sends it to `src/code.ts` (Figma's main thread), which calls `figma.createNodeFromSvg`, names the node, stores the settings with `setSharedPluginData("qrdx", "qrdx", …)` (private plugin data needs a plugin id, which a build imported from source doesn't have) and sets relaunch data when Figma allows it. `src/messages.ts` holds the message types and validates everything the main thread receives. The plugin has no network access (`"allowedDomains": ["none"]`). The playground link is built in `src/playground-link.ts` and opened by the main thread with `figma.openExternal`, only when you click it. A web address (http or https, without a user name or password) goes after the `#`, which browsers never send to a server; text that isn't a web address is never passed. `apps/app/tests/plugins/playground-links.test.ts` checks the link against the site's reader.

## Build

```bash
bun run --filter @qrdx/figma-plugin build       # writes dist/code.js and dist/ui.html
bun run --filter @qrdx/figma-plugin dev         # rebuild on change
bun run --filter @qrdx/figma-plugin typecheck
```

`dist/ui.html` is a single file with the UI script and styles inlined, as Figma requires.

## Import for development

1. Build the plugin (above).
2. In the Figma desktop app, open a design file, then **Plugins → Development → Import plugin from manifest…** and select `plugins/figma/manifest.json`.
3. Run it from **Plugins → Development → QRdx**. After rebuilding, close and reopen the plugin to load the new code.

## Publishing

The plugin's Figma id is `1706676658479492903` (`"id"` in `manifest.json`), assigned at the first publish on 23 Nov 2026. Every update is published under it from the Figma desktop app: build, then **Plugins → Development → Manage plugins in development → Publish new version**. Figma asks for two-factor authentication.

- **Icon:** `plugins/chrome/public/icons/icon-128.png` (128 × 128).
- **Images:** 1920 × 1080, real screenshots of the plugin in Figma.
- **Data security answers:** no backend; no network requests; no user authentication; stores data locally (each inserted code's content and style on its layer, with `setSharedPluginData`); a solo developer manages updates. Privacy policy: https://qrdx.dev/legal/privacy-policy.
- **Support contact:** support@qrdx.dev.

## Figma Community listing copy

**Name:** QRdx – QR Code Generator

**Tagline:** Styled, scannable QR codes as editable vector layers.

**Category:** Design tools

**Description:**

> Add QR codes to your designs without leaving Figma.
>
> Type a URL or any text, pick one of 12 styles (Classic, Minimal, Modern, Ocean Blue, Nature, Sunset, Lavender, Caffeine, Pastel Dream, Midnight, Neon, Cyberpunk), adjust the colors and size, and insert. QRdx places the code as editable vector layers, so it stays sharp at any size and exports cleanly to PNG, SVG or PDF.
>
> Need to change the link later? Select the code and run QRdx. "Replace selected QR" swaps in the new code and keeps the old one's size, position and rotation, so your layout doesn't move. "Load its settings" brings back the code's content and style.
>
> QRdx checks your work as you go. It warns when the content is too long for a QR code, when the colors don't have enough contrast to scan reliably, and when a code is light on dark.
>
> Everything runs inside Figma. The plugin has no network access and collects no data.
>
> For more styles, frames and logos, "More options in the QRdx playground" opens the full editor at qrdx.dev.
>
> Made by QRdx (qrdx.dev), the open-source QR code generator.

**Tags:** qr code, qr, qr generator, vector, svg, link, marketing, print, branding, barcode
