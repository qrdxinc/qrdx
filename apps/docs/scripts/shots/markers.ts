#!/usr/bin/env node
// The content lanes leave markers in the English pages where a picture
// belongs: `{/* shot: id | what | how to reach it */}` (`clip:`, `diagram:`).
// This lists them, and with --apply replaces each one that MAP knows with
// <Shot id />, <Clip id /> or <Diagram id /> on its own line, removes the
// ones in REMOVE (screens that don't exist, can't be reached from the local
// stack or aren't offered on qrdx.dev), and leaves the rest for a later pass.
//
//   bun run --filter docs shots:markers            # list, grouped by id
//   bun run --filter docs shots:markers -- --apply # rewrite the pages
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { JOBS as APP_JOBS } from "./jobs";
import { LIBRARY_JOBS } from "./library";

const JOBS = [...APP_JOBS, ...LIBRARY_JOBS];

/** components/mdx/shot-diagram.tsx (not imported: it is a React server module). */
const DIAGRAM_IDS = [
  "dynamic-redirect",
  "static-vs-dynamic",
  "smart-routing",
  "custom-domain",
  "webhook-delivery",
  "image-api",
  "hosted-page-anatomy",
  "import-flow",
  "precise-location-flow",
  "nfc-link",
  "file-delivery",
  "tracking-paths",
  "client-portal-access",
  "self-hosting-stack",
  "wont-scan-contrast",
  "wont-scan-quiet-zone",
  "wont-scan-print-size",
  "wont-scan-eyes",
];

const here = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(here, "..", "..", "content", "docs");
const MARKER =
  /^[ \t]*\{\/\*\s*(shot|clip|diagram):\s*([^|*]+?)\s*(?:\|\s*(.*?))?\s*\*\/\}[ \t]*$/;

/** marker id → the job (or diagram) that fulfils it. Several markers can share one picture. */
const MAP: Record<string, { kind: "shot" | "clip" | "diagram"; id: string }> = {
  // Getting started, playground, designing
  "playground-content-tab": { kind: "shot", id: "playground-type-picker" },
  "playground-link-typed": { kind: "shot", id: "playground-content" },
  "playground-download-button": { kind: "shot", id: "playground-download" },
  "scan-score-badge": { kind: "shot", id: "playground-content" },
  "will-it-scan-panel": { kind: "shot", id: "scan-score-panel" },
  "download-dialog-image-file": { kind: "shot", id: "playground-download" },
  "download-dialog-print-ready": {
    kind: "shot",
    id: "playground-download-print",
  },
  "design-colors-section": { kind: "shot", id: "design-colors" },
  "design-frame-section": { kind: "shot", id: "design-frame" },
  "design-logo-section": { kind: "shot", id: "design-logo" },
  "art-tab-image-qr": { kind: "shot", id: "playground-art" },
  "themes-page-menu": { kind: "shot", id: "themes-menu" },
  "use-a-link-from-menu": { kind: "shot", id: "use-a-link-from" },
  "playground-static-dynamic-switch": {
    kind: "shot",
    id: "playground-content",
  },
  "playground-dynamic-toggle": { kind: "shot", id: "playground-content" },
  "playground-dynamic-on": { kind: "shot", id: "playground-dynamic-on" },
  // Dynamic codes
  "new-code-dialog": { kind: "shot", id: "new-code-dialog" },
  "code-page-overview": { kind: "shot", id: "code-overview" },
  "codes-list-folders": { kind: "shot", id: "codes-list" },
  "code-analytics-tab": { kind: "shot", id: "code-analytics" },
  "when-people-scan": { kind: "shot", id: "when-people-scan" },
  "edit-link-dialog": { kind: "shot", id: "edit-link-dialog" },
  "short-link-domain-picker": { kind: "shot", id: "short-link-domain-picker" },
  "change-type-dialog": { kind: "shot", id: "change-type-dialog" },
  "access-schedule-panel": { kind: "shot", id: "code-settings" },
  "password-field-access-schedule": { kind: "shot", id: "code-password" },
  "password-screen": { kind: "shot", id: "scan-password" },
  "password-page-scanner": { kind: "shot", id: "scan-password" },
  "error-page-campaign-ended": { kind: "shot", id: "scan-ended" },
  "routing-panel-rules": { kind: "shot", id: "routing-rules" },
  "routing-tester": { kind: "shot", id: "routing-test" },
  "smart-routing-add-rule": { kind: "shot", id: "routing-add-rule" },
  "routing-rules-order": { kind: "diagram", id: "smart-routing" },
  "dynamic-code-redirect": { kind: "diagram", id: "dynamic-redirect" },
  "static-vs-dynamic": { kind: "diagram", id: "static-vs-dynamic" },
  "custom-domain-dns": { kind: "diagram", id: "custom-domain" },
  "import-csv-page": { kind: "shot", id: "import-csv" },
  "nfc-page": { kind: "shot", id: "nfc-page" },
  "precise-location-panel": { kind: "shot", id: "precise-location-panel" },
  "pixels-panel": { kind: "shot", id: "pixels-panel" },
  "share-analytics-dialog": { kind: "shot", id: "share-analytics-dialog" },
  // Pages and forms
  "new-page-picker": { kind: "shot", id: "page-templates" },
  "new-page-type-picker": { kind: "shot", id: "page-templates" },
  "page-editor": { kind: "shot", id: "page-editor" },
  "form-editor": { kind: "shot", id: "form-editor" },
  "responses-inbox": { kind: "shot", id: "form-responses" },
  "form-responses": { kind: "shot", id: "form-responses" },
  "menu-block": { kind: "shot", id: "hosted-menu-page" },
  "files-page": { kind: "shot", id: "files-page" },
  // Teams, domains, settings
  "team-settings": { kind: "shot", id: "team-members" },
  "team-members-roles": { kind: "shot", id: "team-members" },
  "team-invite-form": { kind: "shot", id: "team-invite" },
  "team-require-two-step": { kind: "shot", id: "require-two-step" },
  "workspace-switcher": { kind: "shot", id: "workspace-switcher" },
  "create-workspace-dialog": { kind: "shot", id: "create-workspace-dialog" },
  "workspace-danger-zone": { kind: "shot", id: "workspace-danger-zone" },
  "audit-log-page": { kind: "shot", id: "audit-log" },
  "sso-settings-oidc": { kind: "shot", id: "single-sign-on" },
  "domains-settings": { kind: "shot", id: "custom-domains" },
  "domains-dns-records": { kind: "shot", id: "dns-records" },
  "client-portal-settings": { kind: "shot", id: "client-portal" },
  "notification-settings": { kind: "shot", id: "notifications" },
  "plan-and-usage": { kind: "shot", id: "plan-usage" },
  "plan-and-usage-manage-billing": { kind: "shot", id: "plan-usage" },
  "affiliate-settings-page": { kind: "shot", id: "affiliate-settings" },
  "pricing-upgrade-buttons": { kind: "shot", id: "pricing-page" },
  // Account and security
  "sign-in-page": { kind: "shot", id: "sign-in-page" },
  "sign-in-code-step": { kind: "shot", id: "sign-in-code-step" },
  "two-step-settings-card": { kind: "shot", id: "two-step-card" },
  "add-passkey-step": { kind: "shot", id: "add-passkey-dialog" },
  "sessions-sign-out": { kind: "shot", id: "sessions-card" },
  "your-data-download": { kind: "shot", id: "your-data-card" },
  "report-abuse-form": { kind: "shot", id: "report-abuse-form" },
  // Concept drawings (components/mdx/shot-diagrams)
  "hosted-page-anatomy": { kind: "diagram", id: "hosted-page-anatomy" },
  "import-flow": { kind: "diagram", id: "import-flow" },
  "precise-location-flow": { kind: "diagram", id: "precise-location-flow" },
  "nfc-link": { kind: "diagram", id: "nfc-link" },
  "file-delivery": { kind: "diagram", id: "file-delivery" },
  "tracking-paths": { kind: "diagram", id: "tracking-paths" },
  "client-portal-access": { kind: "diagram", id: "client-portal-access" },
  "self-hosting-stack": { kind: "diagram", id: "self-hosting-stack" },
  "wont-scan-contrast": { kind: "diagram", id: "wont-scan-contrast" },
  "wont-scan-quiet-zone": { kind: "diagram", id: "wont-scan-quiet-zone" },
  "wont-scan-print-size": { kind: "diagram", id: "wont-scan-print-size" },
  "wont-scan-eyes": { kind: "diagram", id: "wont-scan-eyes" },
  // The React library's pages: what the page's sample draws (library.tsx).
  // A marker that asked for motion gets a still of the result.
  "lib-first-code": { kind: "shot", id: "lib-first-code" },
  "lib-styled-code": { kind: "shot", id: "lib-styled-code" },
  "vue-first-code": { kind: "shot", id: "lib-framed-menu-code" },
  "vanilla-first-code": { kind: "shot", id: "lib-framed-menu-code" },
  "angular-first-code": { kind: "shot", id: "lib-angular-code" },
  "preact-first-code": { kind: "shot", id: "lib-preact-code" },
  "solid-signal-code": { kind: "shot", id: "lib-solid-signal-code" },
  "element-first-code": { kind: "shot", id: "lib-element-code" },
  "nextjs-server-code": { kind: "shot", id: "lib-nextjs-server-code" },
  "lib-download-png": { kind: "shot", id: "lib-download-result" },
  "lib-art-codes": { kind: "shot", id: "lib-art-codes" },
  "lib-templates": { kind: "shot", id: "lib-templates" },
  "lib-frame-banner": { kind: "shot", id: "lib-frame-banner" },
  "lib-circle-code": { kind: "shot", id: "lib-circle-code" },
  "lib-gradient-codes": { kind: "shot", id: "lib-gradient-codes" },
  "lib-logo-code": { kind: "shot", id: "lib-logo-code" },
  // Developers
  "webhooks-add-endpoint": { kind: "shot", id: "add-endpoint-dialog" },
  "webhooks-signing-secret": { kind: "shot", id: "webhook-signing-secret" },
  "webhooks-deliveries": { kind: "shot", id: "webhook-deliveries" },
  "api-key-create-form": { kind: "shot", id: "create-key-dialog" },
  "api-key-copy-dialog": { kind: "shot", id: "api-key-copy-dialog" },
  "api-keys-page": { kind: "shot", id: "api-keys" },
  "api-key-form-access": { kind: "shot", id: "api-key-form-access" },
  "oauth-new-app-form": { kind: "shot", id: "oauth-new-app-form" },
  "oauth-app-credentials": { kind: "shot", id: "oauth-app-credentials" },
  "oauth-consent-screen": { kind: "shot", id: "oauth-consent-screen" },
};

/** Markers no honest picture can fulfil from the local stack; the page loses the comment. */
const REMOVE: Record<string, string> = {
  "save-theme-dialog":
    "the S shortcut opened nothing in the headless run; a later pass",
  "delete-account-dialog":
    "the dialog did not open in the headless run; a later pass",
  "confirm-its-you-dialog":
    "changing the email opens its own dialog first; the confirm step needs a second factor to show",
  "discord-qr-reply": "the Discord bot is not offered on qrdx.dev",
  "slack-settings-add-bot":
    "needs a Slack workspace connected to the local app",
  "slack-qr-reply": "a screen inside Slack, not QRdx",
  "slack-link-and-track": "a flow inside Slack, not QRdx",
  "telegram-reply": "a screen inside Telegram, not QRdx",
  "telegram-restyle": "a flow inside Telegram, not QRdx",
  "import-preview":
    "needs an import from a provider account connected to the local app",
  "import-column-mapping": "needs a file chosen in a native file dialog",
  "location-step": "needs a scan with the browser's own location prompt",
  "precise-locations-card": "no shared locations in the seed",
  "area-condition":
    "no area rule in the seed; the routing rules picture covers the panel",
  "nfc-card-guide": "no vCard Plus code in the seed",
  "coupon-block": "no coupon page in the seed",
  "file-field": "no PDF page in the seed",
  "conversions-card": "no conversions in the seed",
  "branded-stats-page":
    "needs a public stats link made in the dialog, then opened signed out",
  "client-portal-view":
    "needs a client invitation accepted by a second account",
  "ab-split-card": "no A/B results card without live split scans",
  "add-slack-target": "needs a Slack workspace connected to the local app",
  "codes-trash-filter":
    "the trash filter sits behind a menu whose state the runner can't reach reliably yet",
  "scan-checker-result": "needs a photo dropped into the checker",
  "sign-in-continue-with-sso": "needs a verified SSO domain",
  "two-step-authenticator-setup":
    "the step shows an authenticator secret, which must not be published",
  "pay-by-invoice-form": "a pricing dialog; not captured in this pass",
  "nonprofit-request-form": "a pricing dialog; not captured in this pass",
  "product-page-phone": "no product page in the seed",
  "product-details-editor": "no product page in the seed",
  "gs1-link-copy": "no product page on a custom domain in the seed",
  "nextjs-live-code":
    "motion (typing redraws the code); a still would repeat the page's other picture",
  "lib-qr-reader":
    "motion in a running app (a file picker, then the decoded link); no truthful still",
  "n8n-community-nodes-install": "a screen of n8n, not of QRdx",
  "n8n-qrdx-credential": "a screen of n8n, not of QRdx",
  "n8n-qrdx-node-create": "a screen of n8n, not of QRdx",
  "n8n-qrdx-trigger": "a screen of n8n, not of QRdx",
  "mcp-claude-connector": "a dialog of Claude, not of QRdx",
  "mcp-qr-card": "a card inside a Claude chat, not a QRdx screen",
};

interface Found {
  file: string;
  line: number;
  kind: string;
  id: string;
  rest: string;
}

function englishPages(dir = CONTENT): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return englishPages(full);
    return /^[^.]+\.mdx$/.test(name) ? [full] : [];
  });
}

function collect(): Found[] {
  const found: Found[] = [];
  for (const file of englishPages()) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((text, index) => {
        const match = MARKER.exec(text);
        if (match) {
          found.push({
            file,
            line: index + 1,
            kind: match[1],
            id: match[2],
            rest: match[3] ?? "",
          });
        }
      });
  }
  return found;
}

function componentFor(kind: string, id: string): string {
  const tag =
    kind === "clip" ? "Clip" : kind === "diagram" ? "Diagram" : "Shot";
  return `<${tag} id="${id}" />`;
}

function apply(found: Found[]) {
  const byFile = new Map<string, Found[]>();
  for (const marker of found) {
    byFile.set(marker.file, [...(byFile.get(marker.file) ?? []), marker]);
  }
  let replaced = 0;
  let removed = 0;
  for (const [file, markers] of byFile) {
    const lines = readFileSync(file, "utf8").split("\n");
    // From the bottom, so line numbers stay valid.
    for (const marker of [...markers].sort((a, b) => b.line - a.line)) {
      const target = MAP[marker.id];
      if (target) {
        lines[marker.line - 1] = componentFor(target.kind, target.id);
        replaced++;
      } else if (REMOVE[marker.id]) {
        // The comment goes, and a blank line it leaves behind with it.
        lines.splice(marker.line - 1, 1);
        if (lines[marker.line - 1] === "" && lines[marker.line - 2] === "") {
          lines.splice(marker.line - 1, 1);
        }
        removed++;
      }
    }
    writeFileSync(file, lines.join("\n"));
  }
  return { replaced, removed };
}

function main() {
  const found = collect();
  const shotIds = new Set(
    JOBS.filter((job) => job.kind === "shot").map((job) => job.id),
  );
  const clipIds = new Set(
    JOBS.filter((job) => job.kind === "clip").map((job) => job.id),
  );
  // Every mapped target must exist.
  for (const [marker, target] of Object.entries(MAP)) {
    const ok =
      target.kind === "shot"
        ? shotIds.has(target.id)
        : target.kind === "clip"
          ? clipIds.has(target.id)
          : DIAGRAM_IDS.includes(target.id);
    if (!ok)
      throw new Error(
        `MAP: ${marker} → ${target.kind} "${target.id}" does not exist`,
      );
  }
  const groups = new Map<string, Found[]>();
  for (const marker of found)
    groups.set(marker.id, [...(groups.get(marker.id) ?? []), marker]);
  const status = (id: string) =>
    MAP[id]
      ? `→ ${MAP[id].kind} ${MAP[id].id}`
      : REMOVE[id]
        ? `removed: ${REMOVE[id]}`
        : "LEFT for a later pass";
  for (const [id, markers] of [...groups].sort()) {
    console.log(`${markers[0].kind.padEnd(7)} ${id.padEnd(34)} ${status(id)}`);
    for (const marker of markers)
      console.log(`        ${relative(CONTENT, marker.file)}:${marker.line}`);
  }
  const left = [...groups.keys()].filter((id) => !(MAP[id] || REMOVE[id]));
  console.log(
    `\n${found.length} markers, ${groups.size} ids: ${groups.size - left.length - Object.keys(REMOVE).filter((id) => groups.has(id)).length} mapped, ${Object.keys(REMOVE).filter((id) => groups.has(id)).length} removed, ${left.length} left (${left.join(", ")})`,
  );
  if (process.argv.includes("--apply")) {
    const { replaced, removed } = apply(found);
    console.log(
      `Rewrote the pages: ${replaced} markers replaced, ${removed} removed.`,
    );
  }
}

main();
