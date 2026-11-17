// Writes the copy of the docs' namespaces that @repo/i18n loads
// (packages/i18n/messages/en.json) for an app that can't import this one
// (the docs site, which is English only). This app's catalog
// (messages/en.json) stays the only place anyone edits; the copy isn't
// committed, and that app writes it right before it builds or starts
// (`bun run --filter app i18n:docs-messages`), so it can't go stale between
// merges.
//
// Node only (the script and tests).
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  DOCS_MESSAGES_DIR,
  DOCS_MESSAGES_FILE,
  docsMessages,
} from "@repo/i18n/messages";

const REPO = path.resolve(import.meta.dirname, "../../../..");
const SOURCE = path.join(REPO, "apps/app/messages");
const TARGET = path.join(REPO, DOCS_MESSAGES_DIR);

/**
 * The copy's file and its contents: the docs' namespaces of the English
 * catalog, as two-space JSON with a trailing newline.
 */
export function docsMessagesFiles(): Map<string, string> {
  const catalog = JSON.parse(
    readFileSync(path.join(SOURCE, DOCS_MESSAGES_FILE), "utf8"),
  ) as Record<string, unknown>;
  return new Map([
    [DOCS_MESSAGES_FILE, `${JSON.stringify(docsMessages(catalog), null, 2)}\n`],
  ]);
}

/**
 * Writes the copy and removes any other file left there (the other
 * languages' copies, from before the docs were English only). Returns what
 * changed.
 */
export function writeDocsMessages(): string[] {
  const files = docsMessagesFiles();
  const changed: string[] = [];
  mkdirSync(TARGET, { recursive: true });
  for (const [name, text] of files) {
    const file = path.join(TARGET, name);
    if (existsSync(file) && readFileSync(file, "utf8") === text) continue;
    writeFileSync(file, text);
    changed.push(name);
  }
  for (const name of readdirSync(TARGET)) {
    if (!name.endsWith(".json") || files.has(name)) continue;
    rmSync(path.join(TARGET, name));
    changed.push(name);
  }
  return changed;
}
