// Writes emails/, the folder the preview server shows (`email dev --dir
// emails`): one file per template in packages/email/templates that has
// PreviewProps, rendering it with those props (or the ones the server
// passes) in English, and
// messages.json, the English copy those files read (../english.ts). The
// folder isn't committed: it's written before every run from the current
// templates and catalog, so it can't go stale.
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const templates = join(root, "../../packages/email/templates");
const catalog = join(root, "../app/messages/en.json");
const out = join(root, "emails");

/** FirstScanEmail → first-scan, EmailChangeCodeEmail → email-change-code */
const fileName = (component) =>
  component
    .replace(/Email$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const { emails } = JSON.parse(readFileSync(catalog, "utf8"));
writeFileSync(
  join(out, "messages.json"),
  `${JSON.stringify({ emails }, null, 2)}\n`
);

let count = 0;
for (const file of readdirSync(templates).sort()) {
  if (!file.endsWith(".tsx")) continue;
  const module = basename(file, ".tsx");
  const source = readFileSync(join(templates, file), "utf8");
  for (const [, component] of source.matchAll(/^(\w+)\.PreviewProps = /gm)) {
    writeFileSync(
      join(out, `${fileName(component)}.tsx`),
      `// Written by apps/email/scripts/prepare.mjs; edit the template instead.
import { ${component} } from "@repo/email/templates/${module}";
import { english } from "../english";

type Props = Omit<Parameters<typeof ${component}>[0], "intl">;

// \`email export\` renders with no props: the example fills them in.
export default function Preview(props: Partial<Props>) {
  return <${component} {...${component}.PreviewProps} {...props} intl={english} />;
}

Preview.PreviewProps = ${component}.PreviewProps;
`
    );
    count += 1;
  }
}
console.log(`apps/email: ${count} templates in emails/`);
