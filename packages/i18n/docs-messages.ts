// The docs' catalog, for an app that can't import the main app's: the copy
// in messages/en.json that DOCS_MESSAGES_COMMAND writes before that app
// builds or starts (messages.ts). The docs are English only, so English is
// the only file.
import {
  DOCS_MESSAGES_COMMAND,
  DOCS_MESSAGES_DIR,
  DOCS_MESSAGES_FILE,
} from "./messages";

type Catalog = Record<string, unknown>;

/** The docs catalog: DOCS_NAMESPACES of apps/app/messages/en.json. */
export type DocsMessages = Record<string, Catalog>;

/** Reads the copy; rejects when it isn't there. */
export type DocsMessagesReader = () => Promise<unknown>;

/**
 * The copy, as written. Found by a path built at run time: the file isn't
 * committed, so a literal import would fail the type check on a fresh clone.
 */
const readCopy: DocsMessagesReader = async () =>
  (await import(`./messages/${DOCS_MESSAGES_FILE}`)).default;

const isCatalog = (value: unknown): value is Catalog =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The docs' catalog. Throws, naming the command, when the copy hasn't been
 * written. `read` is for tests.
 */
export async function loadDocsMessages(
  read: DocsMessagesReader = readCopy
): Promise<DocsMessages> {
  const where = `${DOCS_MESSAGES_DIR}/${DOCS_MESSAGES_FILE}`;
  let file: unknown;
  try {
    file = await read();
  } catch (cause) {
    throw new Error(
      `${where} is missing: run \`${DOCS_MESSAGES_COMMAND}\` first`,
      { cause }
    );
  }
  if (!isCatalog(file)) {
    throw new Error(
      `${where} isn't a catalog: run \`${DOCS_MESSAGES_COMMAND}\` again`
    );
  }
  return file as DocsMessages;
}
