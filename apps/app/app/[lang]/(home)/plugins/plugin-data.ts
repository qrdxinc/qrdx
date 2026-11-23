// What /plugins adds to the catalog entries (packages/integrations/src/catalog/
// entries/plugins.ts): what kind of plugin it is, where it runs, where to
// install it and what it looks like. A plugin with a `storeUrl` installs from
// its store; the others install from source until they're listed.

import { GITHUB_REPO_URL } from "@repo/config";
import { CHROME_WEB_STORE_URL } from "@repo/integrations/src/catalog/entries/plugins";

const REPO = GITHUB_REPO_URL;

export type PluginSlug = "chrome" | "figma" | "raycast" | "canva";

/**
 * A real screenshot of the plugin, in public/images/plugins (WebP, at most
 * 1600 px wide). To swap one, replace the file and update its size here.
 */
export interface PluginShot {
  src: string;
  width: number;
  height: number;
  /** What the screenshot shows. */
  alt: string;
  /** The line under it; also its thumbnail's name. */
  caption: string;
  /** A whole window with its own rounded corners: drawn without a border. */
  window?: boolean;
}

export interface PluginInfo {
  slug: PluginSlug;
  /** Eyebrow, e.g. "Browser extension". */
  kind: string;
  /** Where it runs, as short chips. */
  platforms: string[];
  /** The store it will be listed in. */
  store: string;
  /** Store listing; set once it's published, and it becomes the main button. */
  storeUrl?: string;
  /** Install-from-source instructions: the README section, else the folder. */
  installUrl: string;
  sourceUrl: string;
  /** Its screenshots, the first shown first. */
  shots: PluginShot[];
}

const SHOTS = "/images/plugins";

export const PLUGINS: PluginInfo[] = [
  {
    slug: "chrome",
    kind: "Browser extension",
    platforms: ["Chrome 120+", "Windows", "macOS", "Linux", "ChromeOS"],
    store: "Chrome Web Store",
    storeUrl: CHROME_WEB_STORE_URL,
    installUrl: `${REPO}/tree/main/plugins/chrome#build-and-load-unpacked`,
    sourceUrl: `${REPO}/tree/main/plugins/chrome`,
    shots: [
      {
        src: `${SHOTS}/chrome-popup.webp`,
        width: 1280,
        height: 800,
        alt: "The QRdx Chrome extension's popup: a code for the current page, the style presets, the colors and the export size.",
        caption: "The popup draws a code for the page you're on.",
      },
      {
        src: `${SHOTS}/chrome-right-click.webp`,
        width: 1280,
        height: 800,
        alt: "Selected text on a web page, its right-click menu with “QR code for selected text”, and the popup showing that text's code.",
        caption: "Right-click a link, an image or selected text.",
      },
    ],
  },
  {
    slug: "figma",
    kind: "Figma plugin",
    platforms: ["Figma Design", "Desktop app for macOS and Windows"],
    store: "Figma Community",
    installUrl: `${REPO}/tree/main/plugins/figma#import-for-development`,
    sourceUrl: `${REPO}/tree/main/plugins/figma`,
    shots: [
      {
        src: `${SHOTS}/figma-replace.webp`,
        width: 1600,
        height: 1193,
        alt: "A QR code on the Figma canvas as vector layers, selected, with the QRdx plugin open to replace it or insert a new one.",
        caption: "Codes land as vector layers. Select one to replace it.",
      },
      {
        src: `${SHOTS}/figma-styles.webp`,
        width: 1373,
        height: 1368,
        alt: "The QRdx Figma plugin: the URL field, a live preview and the style presets above Insert QR code.",
        caption: "Type a URL or text, pick a style and insert it.",
      },
    ],
  },
  {
    slug: "raycast",
    kind: "Raycast extension",
    platforms: ["Raycast for macOS", "Raycast AI"],
    store: "Raycast Store",
    installUrl: `${REPO}/tree/main/plugins/raycast`,
    sourceUrl: `${REPO}/tree/main/plugins/raycast`,
    shots: [
      {
        src: `${SHOTS}/raycast-body-patterns.webp`,
        width: 1500,
        height: 950,
        alt: "The QRdx Raycast extension's body-pattern picker with previews of each pattern.",
        caption: "Pick a body pattern from a preview of each.",
        window: true,
      },
      {
        src: `${SHOTS}/raycast-corner-eyes.webp`,
        width: 1500,
        height: 950,
        alt: "The Raycast extension's corner-eye picker, with Square, Rounded and Gear previews.",
        caption: "Corner eyes are picked the same way.",
        window: true,
      },
      {
        src: `${SHOTS}/raycast-ai.webp`,
        width: 1500,
        height: 950,
        alt: "Generate QR with AI in Raycast, with example descriptions to start from.",
        caption: "Or describe the code and Raycast AI sets it up.",
        window: true,
      },
    ],
  },
  {
    slug: "canva",
    kind: "Canva app",
    platforms: ["Canva editor", "Web and desktop app"],
    store: "Canva Apps Marketplace",
    installUrl: `${REPO}/tree/main/plugins/canva`,
    sourceUrl: `${REPO}/tree/main/plugins/canva`,
    shots: [
      {
        src: `${SHOTS}/canva-editor.webp`,
        width: 1600,
        height: 854,
        alt: "The QRdx app in Canva's side panel, with the URL, a preview and pattern thumbnails, next to a design with the code on its page.",
        caption: "Style the code in the side panel and add it to your page.",
      },
    ],
  },
];

export const REQUEST_PLUGIN_URL = `${REPO}/issues/new`;
