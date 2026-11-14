// Every picture and clip in the docs, as a job the runner (run.ts) can
// replay after a UI change. Steps reach the state through the app's own UI,
// by role, label and visible text. The data they see is the seed
// (seed.mjs): Harbor Lane Coffee, a café that doesn't exist, in a Business
// workspace, so every feature of qrdx.dev is on screen.
//
// Ids are what pages write in <Shot id="…" />. Keep them stable: renaming
// one breaks every page that uses it (the build says which).
import type { Driver, Job } from "./types";

/** The open dialog, whatever its title. */
const DIALOG = {
  find: "css",
  name: '[role="dialog"], [role="alertdialog"]',
} as const;
const MENU = { find: "css", name: '[role="menu"], [role="listbox"]' } as const;
/** A phone, for pages a visitor sees after scanning. */
const PHONE = { width: 390, height: 844, mobile: true } as const;
const TALL = { width: 1440, height: 1100 } as const;

// example.com: reserved for examples, and a domain ending the editor doesn't warn about.
const SAMPLE_URL = "https://example.com/menu";

/** The code page's own tabs are links inside <main> (the sidebar has a "Settings" link too). */
const codeTab = (name: string) => (page: Driver) =>
  page.click("link", name, { within: "main", exact: true });

async function waitDialog(page: Driver) {
  await page.waitFor(
    `() => !!document.querySelector('[role="dialog"], [role="alertdialog"]')`,
  );
  await page.pause(400);
}

/** The playground with a real link typed in, so the preview is a real code. */
async function playgroundWithLink(page: Driver) {
  await page.waitFor(
    `() => !!(window.__e2e && window.__e2e.byRole("tab", "content"))`,
    60_000,
  );
  await page.fill("Website address", SAMPLE_URL);
  await page.pause(800);
  await page.waitQuiet();
}

export const JOBS: Job[] = [
  // ─── Getting started ────────────────────────────────────────────────────
  {
    kind: "shot",
    id: "dashboard-home",
    look: "window",
    title: "The workspace home after signing in",
    alt: "The QRdx dashboard home for a workspace called Harbor Lane Coffee: counts of dynamic codes, scans and landing pages, and a list of recent codes.",
    pages: [
      "/docs/getting-started",
      "/docs/help/getting-started/first-qr-code",
    ],
    route: "{ws}",
  },
  {
    kind: "shot",
    id: "playground-content",
    look: "window",
    title: "The playground with a link typed in",
    alt: "The QRdx playground: the Content tab on the left with a website address filled in and a row of styles to start from, and the live QR code preview on the right.",
    pages: [
      "/docs/help/getting-started/first-qr-code",
      "/docs/getting-started",
    ],
    route: "/playground",
    steps: playgroundWithLink,
  },
  {
    kind: "shot",
    id: "playground-type-picker",
    look: "focus",
    title: "Choosing a QR code type",
    alt: "The Choose a QR code type dialog of the playground, listing content types such as URL, Wi-Fi, vCard, email and payment, with a search field at the top.",
    pages: [
      "/docs/help/getting-started/first-qr-code",
      "/docs/help/getting-started/static-vs-dynamic",
    ],
    route: "/playground",
    viewport: TALL,
    steps: async (page) => {
      await playgroundWithLink(page);
      // The whole "QR code type" card is the button that opens the picker.
      await page.click("button", "QR code type");
      await waitDialog(page);
    },
    focus: DIALOG,
  },
  {
    kind: "shot",
    id: "playground-design",
    look: "window",
    title: "The Design tab of the playground",
    alt: "The Design tab of the playground: colors, body and eye pattern choices and the logo controls on the left, the styled QR code preview on the right.",
    pages: [
      "/docs/help/designing/colors-and-contrast",
      "/docs/features/patterns",
      "/docs/features/colors-gradients",
    ],
    route: "/playground",
    steps: async (page) => {
      await playgroundWithLink(page);
      await page.click("tab", "design", { exact: true });
      await page.pause(600);
    },
  },
  {
    kind: "shot",
    id: "playground-art",
    look: "window",
    title: "The Art tab of the playground",
    alt: "The Art tab of the playground, where a prompt or a picture turns the code into AI artwork while it stays scannable.",
    pages: ["/docs/help/designing/art", "/docs/features/art-qr"],
    route: "/playground",
    steps: async (page) => {
      await playgroundWithLink(page);
      await page.click("tab", "art", { exact: true });
      await page.pause(600);
    },
  },
  {
    kind: "shot",
    id: "playground-styles",
    look: "focus",
    title: "Browsing every style",
    alt: "The style browser of the playground: a grid of ready-made QR code styles with their names, grouped by category.",
    pages: ["/docs/help/designing/save-a-design", "/docs/features/templates"],
    route: "/playground",
    viewport: TALL,
    steps: async (page) => {
      await playgroundWithLink(page);
      await page.click("button", "Browse all");
      await waitDialog(page);
    },
    focus: DIALOG,
  },
  {
    kind: "shot",
    id: "playground-download",
    look: "focus",
    title: "Downloading a code",
    alt: "The Download QR code dialog of the playground: a choice of image file formats such as PNG, SVG and PDF, the size, and the download button.",
    pages: [
      "/docs/help/getting-started/download-and-print",
      "/docs/features/downloads",
    ],
    route: "/playground",
    steps: async (page) => {
      await playgroundWithLink(page);
      await page.click("button", "Download", { exact: true });
      await waitDialog(page);
    },
    focus: DIALOG,
  },
  {
    kind: "shot",
    id: "playground-fine-tune",
    look: "window",
    title: "Fine-tuning colors, dots and the logo",
    alt: "The playground's fine-tune panel: color pickers for the code, its eyes and dots, pattern choices and the logo upload, next to the live preview.",
    pages: [
      "/docs/help/designing/logos",
      "/docs/features/logos",
      "/docs/help/designing/colors-and-contrast",
    ],
    route: "/playground",
    steps: async (page) => {
      await playgroundWithLink(page);
      await page.click("button", "Fine-tune colors, dots and logo");
      await page.pause(800);
    },
  },
  {
    kind: "shot",
    id: "playground-contrast",
    look: "focus",
    title: "The contrast checker",
    alt: "The contrast checker of the playground: the code's foreground and background colors, their contrast ratio, and whether scanners read it well.",
    pages: [
      "/docs/help/designing/colors-and-contrast",
      "/docs/help/designing/scan-score",
    ],
    route: "/playground",
    steps: async (page) => {
      await playgroundWithLink(page);
      await page.click("button", "Open contrast checker");
      await waitDialog(page);
    },
    focus: DIALOG,
  },

  // ─── Dynamic codes ──────────────────────────────────────────────────────
  {
    kind: "shot",
    id: "codes-list",
    look: "window",
    title: "The list of dynamic codes",
    alt: "The Codes page listing dynamic QR codes with their short links, destinations, tags, scan counts and a seven-day sparkline.",
    pages: ["/docs/help/dynamic-codes/create", "/docs/dynamic-qr-codes"],
    route: "{ws}/codes",
  },
  {
    kind: "shot",
    id: "new-code-dialog",
    look: "focus",
    title: "Creating a dynamic code",
    alt: "The New dynamic QR code dialog: the destination URL field, the short link domain, an optional custom back-half and title, folder and tags, and the design preview.",
    pages: ["/docs/help/dynamic-codes/create", "/docs/getting-started"],
    route: "{ws}/codes",
    viewport: TALL,
    steps: async (page) => {
      await page.click("button", "New code", { exact: true });
      await waitDialog(page);
      await page.fill(
        "Destination URL",
        "https://harborlane.example/winter-menu",
      );
      await page.pause(600);
      await page.waitQuiet();
    },
    focus: DIALOG,
  },
  {
    kind: "shot",
    id: "code-overview",
    look: "window",
    title: "A dynamic code's page",
    alt: "The page of a dynamic code named Loyalty card: its short link, the address it opens, scan totals, the QR image with download buttons, and the options grid.",
    pages: [
      "/docs/help/dynamic-codes/change-the-link",
      "/docs/help/dynamic-codes/scans",
    ],
    route: "{ws}/codes/shots_code_loyalty",
  },
  {
    kind: "shot",
    id: "edit-link-dialog",
    look: "focus",
    title: "Changing where a code points",
    alt: "The Edit dynamic QR code dialog, with the Destination URL field at the top, the short link domain and back-half below it, and the code's design on the right.",
    pages: ["/docs/help/dynamic-codes/change-the-link"],
    route: "{ws}/codes/shots_code_loyalty",
    viewport: TALL,
    steps: async (page) => {
      await page.click("button", "Edit link", { exact: true });
      await waitDialog(page);
      await page.waitQuiet(15_000);
    },
    focus: DIALOG,
  },
  {
    kind: "shot",
    id: "code-settings",
    look: "window",
    title: "A code's Settings tab",
    alt: "The Settings tab of a dynamic code: the Pause code switch, the Password field, Starts and Ends dates, the Scan limit and the Fallback URL.",
    pages: [
      "/docs/help/dynamic-codes/pause-schedule-limit",
      "/docs/help/dynamic-codes/password",
      "/docs/code-controls",
    ],
    route: "{ws}/codes/shots_code_loyalty",
    steps: async (page) => {
      await codeTab("Settings")(page);
      await page.waitText("Scan limit");
      await page.pause(400);
    },
  },
  {
    kind: "shot",
    id: "code-password",
    look: "window",
    title: "Protecting a code with a password",
    alt: "The Password field in a code's Settings tab on a code that already has one, with the note that visitors type it once and stay unlocked for six hours.",
    pages: ["/docs/help/dynamic-codes/password", "/docs/code-controls"],
    route: "{ws}/codes/shots_code_latte",
    steps: async (page) => {
      await codeTab("Settings")(page);
      await page.waitText("Scan limit");
      await page.scrollTo("label", "Password");
      await page.scrollWindow(
        await page.evaluate<number>(`() => window.scrollY - 200`),
      );
      await page.pause(300);
    },
    capture: { kind: "element", find: "label", name: "Password", margin: 110 },
  },
  {
    id: "code-analytics",
    look: "window",
    title: "One code's analytics",
    alt: "The Analytics tab of a dynamic code: scans over time, and breakdowns by country, city, device, operating system and browser.",
    pages: ["/docs/help/dynamic-codes/scans", "/docs/tracking-and-conversions"],
    route: "{ws}/codes/shots_code_loyalty",
    steps: async (page) => {
      await codeTab("Analytics")(page);
      await page.waitText("Scans over time", 30_000);
      await page.pause(800);
    },
  },
  {
    kind: "shot",
    id: "analytics-workspace",
    look: "window",
    title: "Workspace analytics",
    alt: "The Analytics page: totals for the last 30 days and a line chart of scans per day across every code in the workspace.",
    pages: ["/docs/help/dynamic-codes/scans", "/docs/tracking-and-conversions"],
    route: "{ws}/analytics",
  },
  {
    kind: "shot",
    id: "routing-rules",
    look: "window",
    title: "Routing rules on a code",
    alt: "The Routing section of a code's Settings tab: a list of rules by operating system, language and time of day, each with its destination, and an A/B split at the end.",
    pages: ["/docs/help/dynamic-codes/routing", "/docs/smart-routing"],
    route: "{ws}/codes/shots_code_loyalty",
    viewport: TALL,
    steps: async (page) => {
      await codeTab("Settings")(page);
      await page.waitText("Add rule");
      // The rules sit above the Add rule button: put that button near the
      // bottom of the viewport so the list fills it.
      await page.evaluate(
        `() => { const b = window.__e2e.byRole("button", "Add rule", { exact: true }); const r = b.getBoundingClientRect(); window.scrollBy({ top: r.bottom - window.innerHeight + 150, behavior: "instant" }); return true; }`,
      );
      await page.pause(300);
    },
  },
  {
    kind: "shot",
    id: "routing-test",
    look: "window",
    title: "Testing routing rules",
    alt: "The routing test panel: a pretend scan with a chosen device, operating system, country and language, the Run test button, and the rule that would match.",
    pages: ["/docs/help/dynamic-codes/routing", "/docs/smart-routing"],
    route: "{ws}/codes/shots_code_loyalty",
    viewport: TALL,
    steps: async (page) => {
      await codeTab("Settings")(page);
      await page.waitText("Test your rules");
      // A collapsible header whose text continues in a smaller span: click
      // the innermost element whose text starts with it.
      await page.evaluate(
        `() => { const norm = window.__e2e.norm; let best = null; const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT); while (walker.nextNode()) { const el = walker.currentNode; if (window.__e2e.visible(el) && norm(el.textContent).startsWith("test your rules")) best = el; } if (!best) throw new Error("no Test your rules"); window.__e2e.click(best); return true; }`,
      );
      await page.waitText("Run test");
      await page.scrollTo("button", "Run test");
      await page.scrollWindow(
        await page.evaluate<number>(`() => window.scrollY - 420`),
      );
      await page.click("button", "Run test", { exact: true });
      await page.pause(1200);
      await page.waitQuiet();
    },
  },
  {
    kind: "shot",
    id: "folders-menu",
    look: "focus",
    title: "Folders",
    alt: "The folder menu of the Codes page, open: All codes, then the workspace's folders Menus, Events and Marketing with a Print runs subfolder, and the option to make a new folder.",
    pages: [
      "/docs/help/dynamic-codes/archive-and-delete",
      "/docs/dynamic-qr-codes",
    ],
    route: "{ws}/codes",
    steps: async (page) => {
      await page.click("button", "All codes, change folder");
      await page.waitFor(
        `() => !!document.querySelector('[role="menu"], [role="listbox"], [role="dialog"]')`,
      );
      await page.pause(400);
    },
    focus: MENU,
  },
  {
    kind: "shot",
    id: "code-actions-menu",
    look: "focus",
    title: "A code's actions menu",
    alt: "The actions menu of a code in the list, open: edit, duplicate, move to a folder, archive and move to trash among them.",
    pages: ["/docs/help/dynamic-codes/archive-and-delete"],
    route: "{ws}/codes",
    steps: async (page) => {
      // The row's "…" button has no name of its own: mark the last button in
      // the row that names the code, then open it with a real pointer click
      // (a Radix menu ignores synthetic clicks).
      await page.evaluate(
        `() => { const title = window.__e2e.byText("Window poster"); const row = title.closest("li, [role=row], article") ?? title.parentElement.parentElement.parentElement; const buttons = [...row.querySelectorAll("button")].filter((b) => window.__e2e.visible(b)); buttons[buttons.length - 1].setAttribute("data-shots-target", "1"); return buttons.length; }`,
      );
      await page.pointerClick("css", "[data-shots-target]");
      await page.waitFor(`() => !!document.querySelector('[role="menu"]')`);
      await page.pause(400);
    },
    focus: MENU,
  },
  {
    kind: "shot",
    id: "change-type-dialog",
    look: "focus",
    title: "Changing what a code opens",
    alt: "The Change type dialog of a dynamic code: the current type, URL, and the other kinds of content the same printed code can open instead.",
    pages: ["/docs/help/dynamic-codes/change-the-type"],
    route: "{ws}/codes/shots_code_loyalty",
    viewport: TALL,
    steps: async (page) => {
      await page.click("button", "Change type", { exact: true });
      await waitDialog(page);
    },
    focus: DIALOG,
  },
  {
    kind: "shot",
    id: "import-csv",
    look: "window",
    title: "Importing codes from a CSV file",
    alt: "The Import codes from CSV page: step one asks for a CSV file and links a sample file; the columns the file may have are listed below.",
    pages: ["/docs/help/dynamic-codes/import", "/docs/migrate"],
    route: "{ws}/codes/import",
  },
  {
    kind: "shot",
    id: "nfc-page",
    look: "window",
    title: "Writing a code's link to an NFC tag",
    alt: "The Use with NFC page of a code: the link to write to a tag, a copy button, and how taps are counted apart from scans.",
    pages: ["/docs/nfc"],
    route: "{ws}/codes/shots_code_loyalty/nfc",
  },

  // ─── Pages and forms ────────────────────────────────────────────────────
  {
    kind: "shot",
    id: "pages-list",
    look: "window",
    title: "The list of hosted pages",
    alt: "The Pages & forms list: a menu page and a feedback form page, each with its short link, template, last update and scan count; the feedback page has a Responses button.",
    pages: [
      "/docs/help/pages-and-forms/create-a-page",
      "/docs/landing-pages",
      "/docs/forms-and-pages",
    ],
    route: "{ws}/pages",
  },
  {
    kind: "shot",
    id: "page-templates",
    look: "focus",
    title: "Starting a page from a template",
    alt: "The page template picker: cards for menu, event, business card, coupon, feedback and other page types.",
    pages: ["/docs/help/pages-and-forms/create-a-page", "/docs/landing-pages"],
    route: "{ws}/pages",
    viewport: TALL,
    steps: async (page) => {
      await page.click("button", "New page", { exact: true });
      await page.pause(1500);
      await page.waitQuiet();
    },
    focus: DIALOG,
  },
  {
    kind: "shot",
    id: "page-editor",
    look: "window",
    title: "The page editor",
    alt: "The page editor for a feedback page: the Blocks tab on the left with the header and form blocks, and a phone-sized live preview of the page on the right.",
    pages: [
      "/docs/help/pages-and-forms/create-a-page",
      "/docs/help/pages-and-forms/forms",
      "/docs/landing-pages",
    ],
    route: "{ws}/pages/shots_page_feedback",
    viewport: TALL,
  },
  {
    kind: "shot",
    id: "form-responses",
    look: "window",
    title: "Form responses",
    alt: "The Responses page of a feedback form: a table of answers with a star rating, the choices picked and a free-text note, and an Export to Google Sheets button.",
    pages: ["/docs/help/pages-and-forms/forms", "/docs/forms-and-pages"],
    route: "{ws}/pages/shots_page_feedback/responses",
  },
  {
    kind: "shot",
    id: "hosted-menu-page",
    look: "window",
    title: "A hosted menu page on a phone",
    alt: "A hosted menu page as a visitor sees it on a phone: the café's name, a menu with sections and prices, opening hours and the Wi-Fi details.",
    pages: ["/docs/help/pages-and-forms/create-a-page", "/docs/landing-pages"],
    route: "/p/k2Pm9Qa",
    viewport: PHONE,
  },
  {
    kind: "shot",
    id: "hosted-form-page",
    look: "window",
    title: "A hosted form on a phone",
    alt: "A hosted feedback form on a phone: a star rating, a multiple-choice question, a text field and a Send button.",
    pages: ["/docs/help/pages-and-forms/forms", "/docs/forms-and-pages"],
    route: "/p/Fz2Hb9m",
    viewport: PHONE,
  },

  // ─── Designs, themes, files ─────────────────────────────────────────────
  {
    kind: "shot",
    id: "themes-list",
    look: "window",
    title: "Saved themes",
    alt: "The Themes page of a workspace: a shared theme named Harbor Lane brand with its preview, marked as the default for new codes.",
    pages: ["/docs/help/designing/save-a-design", "/docs/features/templates"],
    route: "{ws}/themes",
  },
  {
    kind: "shot",
    id: "files-page",
    look: "window",
    title: "The Files page",
    alt: "The Files page of a workspace, where PDFs, images and other files for codes and pages are uploaded, with its Choose files button.",
    pages: ["/docs/files"],
    route: "{ws}/files",
  },

  // ─── Teams and workspace settings ───────────────────────────────────────
  {
    kind: "shot",
    id: "team-members",
    look: "window",
    title: "The Team page",
    alt: "The Team page of a workspace: four members with their roles (owner, admin, member, viewer), whether two-step verification is on, and when they joined; below it, the Require two-step verification switch.",
    pages: [
      "/docs/help/teams/create-and-invite",
      "/docs/help/teams/roles",
      "/docs/teams",
    ],
    route: "{ws}/settings/team",
  },
  {
    kind: "shot",
    id: "team-invite",
    look: "window",
    title: "Inviting someone",
    alt: "The Invite people section of the Team page: an email field, the role to give them, the Send invitation button, and a pending invitation below.",
    pages: ["/docs/help/teams/create-and-invite", "/docs/help/teams/seats"],
    route: "{ws}/settings/team",
    viewport: TALL,
    steps: async (page) => {
      await page.scrollTo("text", "Invite people");
      await page.scrollWindow(
        await page.evaluate<number>(`() => window.scrollY - 120`),
      );
      await page.pause(300);
    },
    capture: {
      kind: "element",
      find: "text",
      name: "Invite people",
      margin: 40,
      below: 420,
    },
  },
  {
    kind: "shot",
    id: "require-two-step",
    look: "window",
    title: "Requiring two-step verification",
    alt: "The Two-step verification card of the Team page, with the Require two-step verification switch and the note that the owner's own account needs it first.",
    pages: ["/docs/help/teams/require-two-step-verification"],
    route: "{ws}/settings/team",
    steps: async (page) => {
      await page.scrollTo("text", "Require two-step verification");
      await page.scrollWindow(
        await page.evaluate<number>(`() => window.scrollY - 200`),
      );
      await page.pause(300);
    },
    capture: {
      kind: "element",
      find: "text",
      name: "Require two-step verification",
      margin: 60,
      below: 150,
    },
  },
  {
    kind: "shot",
    id: "workspace-general",
    look: "window",
    title: "Workspace settings",
    alt: "The General settings of a workspace: its logo, name and URL, with Save and the Delete workspace option at the bottom.",
    pages: ["/docs/teams", "/docs/help/teams/create-and-invite"],
    route: "{ws}/settings",
  },
  {
    kind: "shot",
    id: "plan-usage",
    look: "window",
    title: "Plan and usage",
    alt: "The Plan & usage page: the workspace's plan, what it includes, the Manage billing link, and this month's usage against the plan's limits.",
    pages: [
      "/docs/help/account-and-billing/plans",
      "/docs/help/account-and-billing/change-plan",
      "/docs/plans-and-limits",
      "/docs/usage",
    ],
    route: "{ws}/settings/usage",
    viewport: TALL,
  },
  {
    kind: "shot",
    id: "custom-domains",
    look: "window",
    title: "Custom domains",
    alt: "The Custom domains page: a verified domain, qr.harborlane.example, with its DNS records available to show, a Check DNS button and the Add domain button.",
    pages: ["/docs/help/domains/custom-domains", "/docs/custom-domains"],
    route: "{ws}/settings/domains",
  },
  {
    kind: "shot",
    id: "add-domain-dialog",
    look: "window",
    title: "Adding a domain",
    alt: "The Custom domains page with the Add domain form open: a field for the hostname and the button that adds it.",
    pages: ["/docs/help/domains/custom-domains", "/docs/custom-domains"],
    route: "{ws}/settings/domains",
    steps: async (page) => {
      await page.click("button", "Add domain", { exact: true });
      await page.pause(900);
      await page.waitQuiet();
    },
  },
  {
    kind: "shot",
    id: "dns-records",
    look: "window",
    title: "The DNS records of a domain",
    alt: "The DNS records of a custom domain: a CNAME record pointing the hostname at QRdx and a TXT record proving ownership, each with a copy button.",
    pages: ["/docs/help/domains/custom-domains", "/docs/custom-domains"],
    route: "{ws}/settings/domains",
    steps: async (page) => {
      await page.click("button", "Show DNS records");
      await page.pause(800);
    },
    capture: {
      kind: "element",
      find: "text",
      name: "qr.harborlane.example",
      margin: 60,
      below: 300,
    },
  },
  {
    kind: "shot",
    id: "webhooks-list",
    look: "window",
    title: "Webhooks",
    alt: "The Webhooks page of a workspace: one endpoint with the events it receives, its enabled switch, a Send test button and the Add endpoint button.",
    pages: ["/docs/webhooks", "/docs/developers/quickstart"],
    route: "{ws}/settings/webhooks",
  },
  {
    kind: "shot",
    id: "add-endpoint-dialog",
    look: "focus",
    title: "Adding a webhook endpoint",
    alt: "The Add endpoint dialog: the URL QRdx will post to and the events to subscribe to, such as scan.created and form.submitted.",
    pages: ["/docs/webhooks"],
    route: "{ws}/settings/webhooks",
    steps: async (page) => {
      await page.click("button", "Add endpoint", { exact: true });
      await waitDialog(page);
    },
    focus: DIALOG,
  },
  {
    kind: "shot",
    id: "webhook-deliveries",
    look: "window",
    title: "An endpoint's deliveries",
    alt: "The deliveries page of a webhook endpoint: its signing secret (hidden, with Reveal and Rotate), and recent deliveries with their event, status, attempts and a Retry now button on a failed one.",
    pages: ["/docs/webhooks"],
    route: "{ws}/settings/webhooks/shots_hook_crm",
  },
  {
    kind: "shot",
    id: "api-keys",
    look: "window",
    title: "API keys",
    alt: "The API keys & apps page: two keys with their names, masked prefixes, scopes and last use, a Create key button, and the OAuth apps section below.",
    pages: [
      "/docs/developers/api-keys",
      "/docs/developers/quickstart",
      "/docs/developers/rest-api",
    ],
    route: "{ws}/settings/developers",
  },
  {
    kind: "shot",
    id: "create-key-dialog",
    look: "focus",
    title: "Creating an API key",
    alt: "The Create key dialog: a name for the key, the access to give it (full, read only or custom scopes) and an optional expiry.",
    pages: ["/docs/developers/api-keys", "/docs/developers/quickstart"],
    route: "{ws}/settings/developers",
    steps: async (page) => {
      await page.click("button", "Create key", { exact: true });
      await waitDialog(page);
    },
    focus: DIALOG,
  },
  {
    kind: "shot",
    id: "client-portal",
    look: "window",
    title: "The client portal settings",
    alt: "The Client portal page: the portal's branding (logo and accent), the switch that turns it on, and the Invite client button.",
    pages: ["/docs/client-portal", "/docs/client-reports"],
    route: "{ws}/settings/clients",
  },
  {
    kind: "shot",
    id: "audit-log",
    look: "window",
    title: "The audit log",
    alt: "The Audit log page of a Business workspace, with filters by person and category above the list of recorded changes.",
    pages: ["/docs/help/teams/audit-log"],
    route: "{ws}/settings/audit-log",
  },
  {
    kind: "shot",
    id: "single-sign-on",
    look: "window",
    title: "Single sign-on settings",
    alt: "The Single sign-on page: tabs for OIDC and SAML 2.0, the fields for the identity provider's details, and the Save connection button.",
    pages: ["/docs/help/teams/single-sign-on"],
    route: "{ws}/settings/sso",
    viewport: TALL,
  },

  // ─── Account ────────────────────────────────────────────────────────────
  {
    kind: "shot",
    id: "account-security",
    look: "window",
    title: "Profile and security",
    alt: "The security part of the Profile & security page: two-step verification with its Turn on button, passkeys with one named Work laptop, and the devices signed in to the account.",
    pages: [
      "/docs/help/privacy-and-security/account-security",
      "/docs/help/privacy-and-security/two-step-verification",
      "/docs/help/privacy-and-security/passkeys",
    ],
    route: "/settings/account",
    viewport: TALL,
    steps: async (page) => {
      await page.scrollTo("text", "Two-step verification");
      await page.scrollWindow(
        await page.evaluate<number>(`() => window.scrollY - 140`),
      );
      await page.pause(300);
    },
  },
  {
    kind: "shot",
    id: "two-step-dialog",
    look: "focus",
    title: "Turning on two-step verification",
    alt: "The first step of turning on two-step verification: the choice between a passkey and an authenticator app as the second step.",
    pages: ["/docs/help/privacy-and-security/two-step-verification"],
    route: "/settings/account",
    steps: async (page) => {
      await page.click("button", "Turn on", { exact: true });
      await waitDialog(page);
      await page.waitQuiet();
    },
    focus: DIALOG,
  },
  {
    kind: "shot",
    id: "passkeys",
    look: "window",
    title: "Passkeys on the account",
    alt: "The Passkeys section of Profile & security: a passkey named Work laptop with when it was added, its options menu, and the Add passkey button.",
    pages: ["/docs/help/privacy-and-security/passkeys"],
    route: "/settings/account",
    steps: async (page) => {
      await page.scrollTo("text", "Passkeys");
      await page.scrollWindow(
        await page.evaluate<number>(`() => window.scrollY - 120`),
      );
      await page.pause(300);
    },
    capture: {
      kind: "element",
      find: "text",
      name: "Passkeys",
      margin: 48,
      below: 360,
    },
  },
  {
    kind: "shot",
    id: "notifications",
    look: "window",
    title: "Notification settings",
    alt: "The Notifications page: email alerts for scan milestones and form submissions with their switches, and the Slack and Discord options.",
    pages: ["/docs/notifications"],
    route: "/settings/notifications",
  },
  {
    kind: "shot",
    id: "preferences",
    look: "window",
    title: "Preferences",
    alt: "The Preferences page: the app's language, the light, dark and system theme choices, and keyboard shortcuts.",
    pages: ["/docs/help/account-and-billing/sign-in"],
    route: "/settings/general",
  },

  // ─── What a scanner can see ─────────────────────────────────────────────
  {
    kind: "shot",
    id: "scan-password",
    look: "window",
    title: "A password-protected code, as scanned",
    alt: "What a phone shows after scanning a password-protected code: the message This QR code is password protected, a password field and a Continue button.",
    pages: [
      "/docs/help/dynamic-codes/password",
      "/docs/help/troubleshooting/error-pages",
    ],
    route: "/q/Vb6Nf2s",
    viewport: PHONE,
  },
  {
    kind: "shot",
    id: "scan-ended",
    look: "window",
    title: "An ended campaign, as scanned",
    alt: "What a phone shows after scanning a code whose end date has passed: the message This campaign has ended.",
    pages: [
      "/docs/help/troubleshooting/error-pages",
      "/docs/help/dynamic-codes/pause-schedule-limit",
    ],
    route: "/q/Jd3Xr5p",
    viewport: PHONE,
  },
  {
    kind: "shot",
    id: "scan-paused",
    look: "window",
    title: "A paused code, as scanned",
    alt: "What a phone shows after scanning a paused code: the message This campaign is paused.",
    pages: [
      "/docs/help/troubleshooting/error-pages",
      "/docs/help/dynamic-codes/pause-schedule-limit",
    ],
    route: "/q/Ym8Kt1u",
    viewport: PHONE,
  },
  {
    kind: "shot",
    id: "scan-not-started",
    look: "window",
    title: "A scheduled code before its start, as scanned",
    alt: "What a phone shows after scanning a code whose start date is in the future: the message This campaign hasn't started yet.",
    pages: [
      "/docs/help/troubleshooting/error-pages",
      "/docs/help/dynamic-codes/pause-schedule-limit",
    ],
    route: "/q/Cn9Lp4r",
    viewport: PHONE,
  },
  {
    kind: "shot",
    id: "scan-not-found",
    look: "window",
    title: "A deleted or unknown code, as scanned",
    alt: "What a phone shows after scanning a code that no longer exists: the message QR code not found.",
    pages: [
      "/docs/help/troubleshooting/error-pages",
      "/docs/help/dynamic-codes/archive-and-delete",
    ],
    route: "/q/nothere",
    viewport: PHONE,
  },

  // ─── Clips ──────────────────────────────────────────────────────────────
  {
    kind: "clip",
    id: "first-code",
    title: "Making a first code in the playground",
    alt: "In the playground, a website address is typed in, the live preview becomes a real code, a style is picked and the Download button is opened.",
    pages: [
      "/docs/help/getting-started/first-qr-code",
      "/docs/getting-started",
    ],
    route: "/playground",
    steps: async (page) => {
      await page.waitFor(
        `() => !!(window.__e2e && window.__e2e.byRole("tab", "content"))`,
        60_000,
      );
    },
    record: async (page) => {
      await page.pointerClick("label", "Website address");
      await page.type("example.com/menu");
      await page.pause(1400);
      await page.click("button", "Apply the Harbor style");
      await page.pause(1600);
      await page.click("button", "Apply the Modern style");
      await page.pause(1600);
      await page.click("button", "Download", { exact: true });
      await page.pause(2200);
    },
    tail: 1.5,
  },
  {
    kind: "clip",
    id: "change-destination",
    title: "Changing a printed code's destination",
    alt: "On a dynamic code's page, Edit link is opened, the destination address is replaced with a new one and the change is saved; the printed code stays the same.",
    pages: [
      "/docs/help/dynamic-codes/change-the-link",
      "/docs/dynamic-qr-codes",
    ],
    route: "{ws}/codes/shots_code_window",
    record: async (page) => {
      await page.pause(600);
      await page.click("button", "Edit link", { exact: true });
      await waitDialog(page);
      await page.pause(900);
      await page.pointerClick("label", "Destination URL");
      await page.press("a");
      await page.evaluate(
        `() => { const el = document.activeElement; if (el && "select" in el) el.select(); return true; }`,
      );
      await page.type("https://harborlane.example/winter-blend");
      await page.pause(1200);
      await page.click("button", "Save changes");
      await page.pause(2500);
    },
    tail: 1.5,
  },
  {
    kind: "clip",
    id: "add-routing-rule",
    title: "Adding a routing rule",
    alt: "In a code's Settings tab, a routing rule is added: a condition on the operating system is picked and a destination for it is typed, then the rules are saved.",
    pages: ["/docs/help/dynamic-codes/routing", "/docs/smart-routing"],
    route: "{ws}/codes/shots_code_sleeve",
    steps: async (page) => {
      await codeTab("Settings")(page);
      await page.waitText("Add rule");
      await page.scrollTo("button", "Add rule");
      await page.scrollWindow(
        await page.evaluate<number>(`() => window.scrollY - 500`),
      );
    },
    record: async (page) => {
      await page.pause(600);
      await page.click("button", "Add rule", { exact: true });
      await page.pause(1800);
      // The new rule's own controls (their labels differ between kinds of rule).
      await page.click("button", "Add condition").catch(() => undefined);
      await page.pause(1800);
      await page.evaluate(
        `() => { window.scrollBy({ top: 240, behavior: "smooth" }); return true; }`,
      );
      await page.pause(2200);
    },
    tail: 2,
  },
  {
    kind: "clip",
    id: "create-page",
    title: "Creating a page from a template",
    alt: "On the Pages & forms list, New page opens the template picker, a template is chosen and the editor opens with the page's blocks and its phone preview.",
    pages: ["/docs/help/pages-and-forms/create-a-page", "/docs/landing-pages"],
    route: "{ws}/pages",
    record: async (page) => {
      await page.pause(600);
      await page.click("button", "New page", { exact: true });
      await page.pause(3000);
      await page.clickText("Menu");
      await page.pause(5500);
    },
    tail: 2.5,
  },
];
