// The public widgets are pure client code: the generators, the pricing cards
// and their dialogs, the enterprise form, the bulk tool and the home page's
// MCP terminal. The marketing site, a separate app served on the same origin
// (qrdx.dev), renders them, and it can neither call this app's server
// actions nor reach its database; the widgets call same-origin routes
// instead (lib/widget-routes). The small modules the marketing pages read
// limits and URLs from (the last entries of WIDGETS) are held to the same
// rules.
//
// This walks each widget's imports: value imports, re-exports, import() and
// require(), which a bundler follows, and type-only imports, which the
// site's typecheck follows. It fails on:
//   - a module that starts with "use server" (server actions),
//   - a module that imports "server-only",
//   - any import of @repo/database, value or type,
//   - an app or workspace import it can't resolve (so a broken resolver can't
//     pass by finding nothing).
// TYPE_DEBT lists the type-only imports it doesn't follow yet. `@/env` isn't
// followed either: a zone that renders these widgets brings its own env
// module under that name (the site maps it to its own env.ts, declaring only
// the public variables it has), while this app's env.ts declares the
// database's keys.
import { readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const APP = join(import.meta.dirname, "..", "..");
const REPO = join(APP, "..", "..");

const WIDGETS = {
  // /qr-code-generator/<type>
  TypeGenerator: "components/sections/tools/type-generator.tsx",
  // /barcode-generator and /barcode-generator/<format>
  PublicBarcodeGenerator: "components/sections/tools/save-barcode.tsx",
  // /pricing: the plan cards, checkout, and the invoice and non-profit dialogs
  PricingSection: "components/sections/pricing-section.tsx",
  // /enterprise
  EnterpriseContactForm: "app/[lang]/(home)/enterprise/contact-form.tsx",
  // /tools/bulk
  BulkGenerator: "components/sections/tools/bulk-generator.tsx",
  // The home page's feature rows
  McpTerminal: "components/mockups/mcp-terminal.tsx",
  // What marketing pages read limits, prices and URLs from
  QrImageUrl: "lib/qr-image-url.ts",
  RoutingLimits: "lib/redirect/routing-limits.ts",
  Media: "lib/media.ts",
  Region: "lib/region.ts",
};

/**
 * Type-only imports (erased from the bundle) whose types still come from
 * server modules: the integrations catalogue's types (@repo/integrations
 * re-exports its database-backed manager), the data connections' row types
 * and the dynamic code view (codes/_lib/qr-codes.ts). The widgets load none
 * of that code, but a typecheck of them reads it. Each entry is
 * "<importing file> -> <specifier>"; remove it when its types move to a pure
 * module (the test fails while a listed import no longer exists).
 */
const TYPE_DEBT = new Set([
  "components/code-builder/in-place.ts -> @/app/(app)/dashboard/codes/_lib/qr-codes",
  "components/code-builder/store.ts -> @/app/(app)/dashboard/codes/_lib/qr-codes",
  "components/code-builder/store.ts -> ./optimistic",
  "components/connected-accounts/cloud-picker-dialog.tsx -> @repo/integrations",
  "components/connected-accounts/short-link-dialog.tsx -> @repo/integrations",
  "components/data-connections/source-picker.tsx -> @repo/integrations",
  "lib/connected-accounts/client.ts -> @repo/integrations",
  "lib/connected-accounts/mock.ts -> @repo/integrations",
  "lib/data-connections/client.ts -> @repo/integrations",
  "lib/data-connections/client.ts -> ./data",
  "lib/data-connections/mock.ts -> @repo/integrations",
  "lib/data-connections/mock.ts -> ./data",
]);

const config = ts.parseJsonConfigFileContent(
  ts.readConfigFile(join(APP, "tsconfig.json"), ts.sys.readFile).config,
  ts.sys,
  APP,
);
const host = ts.createCompilerHost(config.options);

interface Import {
  specifier: string;
  typeOnly: boolean;
}

interface ModuleInfo {
  useServer: boolean;
  serverOnly: boolean;
  imports: Import[];
}

const cache = new Map<string, ModuleInfo>();

/** `import { type A, type B }` is erased like `import type { A, B }`. */
function allTypeOnly(
  elements: ts.NodeArray<ts.ImportSpecifier | ts.ExportSpecifier>,
): boolean {
  return elements.length > 0 && elements.every((element) => element.isTypeOnly);
}

function importOf(node: ts.Node): Import | null {
  if (
    ts.isImportDeclaration(node) &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    const clause = node.importClause;
    const bindings = clause?.namedBindings;
    const typeOnly =
      (clause?.isTypeOnly ?? false) ||
      (clause !== undefined &&
        !clause.name &&
        bindings !== undefined &&
        ts.isNamedImports(bindings) &&
        allTypeOnly(bindings.elements));
    return { specifier: node.moduleSpecifier.text, typeOnly };
  }
  if (
    ts.isExportDeclaration(node) &&
    node.moduleSpecifier &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    const clause = node.exportClause;
    const typeOnly =
      node.isTypeOnly ||
      (clause !== undefined &&
        ts.isNamedExports(clause) &&
        allTypeOnly(clause.elements));
    return { specifier: node.moduleSpecifier.text, typeOnly };
  }
  if (
    ts.isCallExpression(node) &&
    node.arguments.length === 1 &&
    ts.isStringLiteral(node.arguments[0]) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === "require"))
  ) {
    return { specifier: node.arguments[0].text, typeOnly: false };
  }
  if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteral(node.argument.literal)
  ) {
    return { specifier: node.argument.literal.text, typeOnly: true };
  }
  return null;
}

function read(file: string): ModuleInfo {
  const cached = cache.get(file);
  if (cached) return cached;
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );

  let useServer = false;
  for (const statement of source.statements) {
    if (
      !(
        ts.isExpressionStatement(statement) &&
        ts.isStringLiteral(statement.expression)
      )
    ) {
      break;
    }
    if (statement.expression.text === "use server") useServer = true;
  }

  const imports: Import[] = [];
  const visit = (node: ts.Node) => {
    const found = importOf(node);
    if (found) imports.push(found);
    ts.forEachChild(node, visit);
  };
  visit(source);

  const info: ModuleInfo = {
    useServer,
    serverOnly: imports.some(
      ({ specifier, typeOnly }) => specifier === "server-only" && !typeOnly,
    ),
    imports,
  };
  cache.set(file, info);
  return info;
}

/** Each zone's own environment module (see the top of this file). */
const ZONE_ENV = "@/env";

const OWN = /^(?:\.{1,2}\/|@\/|@repo\/)/;
const ASSET = /\.(?:css|scss|svg|png|jpe?g|gif|webp|avif|ico|woff2?|txt|md)$/;

type Resolved = { file: string } | { external: true } | { missing: true };

function resolve(specifier: string, from: string): Resolved {
  const resolved = ts.resolveModuleName(
    specifier,
    from,
    config.options,
    host,
  ).resolvedModule;
  if (!resolved) {
    return OWN.test(specifier) && !ASSET.test(specifier)
      ? { missing: true }
      : { external: true };
  }
  const file = realpathSync(resolved.resolvedFileName);
  if (
    !file.startsWith(REPO) ||
    file.includes("/node_modules/") ||
    /\.d\.[cm]?ts$/.test(file)
  ) {
    return { external: true };
  }
  return { file };
}

const rel = (file: string) => relative(APP, file);

interface Walk {
  /** Every module reached, relative to apps/app */
  files: string[];
  problems: string[];
  /** TYPE_DEBT entries this walk met */
  debt: Set<string>;
}

/** What the module at `entry` (relative to apps/app) imports, and what's wrong in it. */
function walk(entry: string): Walk {
  const start = join(APP, entry);
  // How each module was first reached: from where, and whether by a type import.
  const parent = new Map<string, { from: string; type: boolean } | null>([
    [start, null],
  ]);
  const queue = [start];
  const problems: string[] = [];
  const debt = new Set<string>();

  const chain = (file: string) => {
    const steps = [rel(file)];
    for (let at = parent.get(file); at; at = parent.get(at.from)) {
      steps.unshift(`${rel(at.from)} ${at.type ? "-(type)->" : "->"}`);
    }
    return steps.join(" ");
  };

  while (queue.length > 0) {
    const file = queue.shift() as string;
    const info = read(file);
    if (info.useServer) {
      problems.push(`server action module: ${chain(file)}`);
      continue;
    }
    if (info.serverOnly) {
      problems.push(`imports "server-only": ${chain(file)}`);
      continue;
    }
    for (const { specifier, typeOnly } of info.imports) {
      if (specifier === ZONE_ENV) continue;
      if (/^@repo\/database(?:\/|$)/.test(specifier)) {
        const kind = typeOnly ? "type import" : "import";
        problems.push(`${kind} of ${specifier}: ${chain(file)}`);
        continue;
      }
      const edge = `${rel(file)} -> ${specifier}`;
      if (typeOnly && TYPE_DEBT.has(edge)) {
        debt.add(edge);
        continue;
      }
      const target = resolve(specifier, file);
      if ("missing" in target) {
        problems.push(`can't resolve ${specifier}: ${chain(file)}`);
        continue;
      }
      if ("external" in target || parent.has(target.file)) continue;
      parent.set(target.file, { from: file, type: typeOnly });
      queue.push(target.file);
    }
  }
  return { files: [...parent.keys()].map(rel), problems, debt };
}

describe("public widgets are pure client code", () => {
  const walks = Object.fromEntries(
    Object.entries(WIDGETS).map(([name, entry]) => [name, walk(entry)]),
  ) as Record<keyof typeof WIDGETS, Walk>;

  for (const [name, entry] of Object.entries(WIDGETS)) {
    it(`${name} (${entry}) reaches no server action, server-only module or @repo/database`, () => {
      expect(walks[name as keyof typeof WIDGETS].problems).toEqual([]);
    });
  }

  it("every TYPE_DEBT entry is still an import the widgets reach", () => {
    const met = new Set(Object.values(walks).flatMap(({ debt }) => [...debt]));
    expect([...TYPE_DEBT].filter((edge) => !met.has(edge))).toEqual([]);
  });

  it("the walk follows the widgets' real imports", () => {
    // The paths that reached server actions before, now through fetch.
    for (const file of [
      "components/editor/content-forms/url-form.tsx",
      "components/editor/dynamic-link-toggle.tsx",
      "components/copy-button.tsx",
      "components/tooltip-wrapper.tsx",
      "lib/hooks/use-user-settings.tsx",
      "store/editor-store.ts",
      "utils/qr-presets-helper.ts",
      "store/theme-preset-store.ts",
      "types/theme.ts",
      "lib/widget-routes/client.ts",
    ]) {
      expect(walks.TypeGenerator.files, file).toContain(file);
    }
    for (const file of [
      "components/sections/tools/barcode-generator.tsx",
      "lib/widget-routes/client.ts",
    ]) {
      expect(walks.PublicBarcodeGenerator.files, file).toContain(file);
    }
    // /pricing: checkout, the two dialogs and the plan, through fetch.
    for (const file of [
      "components/sections/pricing/invoice-request-dialog.tsx",
      "components/sections/pricing/nonprofit-request-dialog.tsx",
      "components/sections/pricing/pricing-offers.tsx",
      "lib/hooks/use-subscription.ts",
      "lib/widget-routes/client.ts",
      "types/action-results.ts",
    ]) {
      expect(walks.PricingSection.files, file).toContain(file);
    }
    expect(walks.EnterpriseContactForm.files).toContain(
      "lib/widget-routes/client.ts",
    );
    for (const file of [
      "lib/hooks/use-themes.ts",
      "lib/widget-routes/client.ts",
    ]) {
      expect(walks.BulkGenerator.files, file).toContain(file);
    }
    expect(walks.McpTerminal.files).toContain("lib/qr-image-url.ts");
    expect(walks.McpTerminal.files).not.toContain("lib/qr-render.ts");
  });

  it("and catches each kind of problem", () => {
    // The playground's own modules still use the server actions directly.
    expect(walk("components/editor/use-saved-themes.ts").problems).toContain(
      "server action module: components/editor/use-saved-themes.ts -> actions/qr-themes.ts",
    );
    expect(walk("lib/hooks/user-settings-provider.tsx").problems).toContain(
      "type import of @repo/database/schema: lib/hooks/user-settings-provider.tsx",
    );
    expect(walk("lib/hooks/themes/use-themes-data.ts").problems).toContain(
      "type import of @repo/database: lib/hooks/themes/use-themes-data.ts -(type)-> types/theme-row.ts",
    );
    expect(walk("lib/widget-routes/server.ts").problems).toContain(
      'imports "server-only": lib/widget-routes/server.ts',
    );
    // The routes themselves run the actions; the renderer and the redirect
    // engine stay server code.
    expect(walk("app/api/subscription/checkout/route.ts").problems).toContain(
      "server action module: app/api/subscription/checkout/route.ts -> actions/checkout.ts",
    );
    expect(walk("lib/qr-render.ts").problems).toContain(
      'imports "server-only": lib/qr-render.ts',
    );
    expect(walk("lib/redirect/routing.ts").problems).toContain(
      'imports "server-only": lib/redirect/routing.ts',
    );
  });
});
