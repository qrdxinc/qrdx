import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  ICredentialType,
  INodeProperties,
  INodePropertyOptions,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";
import { describe, expect, it } from "vitest";
import { QrdxApi } from "../credentials/QrdxApi.credentials";
import {
  BARCODE_FILE_TYPES,
  BARCODE_FORMATS,
  BARCODE_ROTATIONS,
  BARCODE_SCALE,
} from "../nodes/Qrdx/constants";
import { Qrdx } from "../nodes/Qrdx/Qrdx.node";
import { QrdxTrigger } from "../nodes/Qrdx/QrdxTrigger.node";

// What n8n's loader expects of the package: each `n8n` entry is a file whose
// exported class has the file's name, the icons exist, and the nodes refer
// to the credential the package ships.

const root = join(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  name: string;
  version: string;
  files: string[];
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  keywords: string[];
  n8n: { credentials: string[]; nodes: string[] };
};

const CLASSES: Record<string, new () => INodeType | ICredentialType> = {
  QrdxApi,
  Qrdx,
  QrdxTrigger,
};

/** dist/nodes/Qrdx/Qrdx.node.js → nodes/Qrdx/Qrdx.node.ts */
const sourceOf = (entry: string) =>
  entry.replace(/^dist\//, "").replace(/\.js$/, ".ts");

function iconFiles(icon: unknown, sourceFile: string): string[] {
  const values =
    typeof icon === "string"
      ? [icon]
      : Object.values(icon as Record<string, string>);
  return values.map((value) =>
    join(root, dirname(sourceFile), value.replace(/^file:/, ""))
  );
}

describe("package.json", () => {
  it("is the publishable n8n community package", () => {
    expect(pkg.name).toBe("@qrdx/n8n-nodes-qrdx");
    expect(pkg.version).toBe("0.1.2");
    expect(pkg.keywords).toContain("n8n-community-node-package");
    expect(pkg.files).toEqual(["dist"]);
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.peerDependencies).toEqual({ "n8n-workflow": "*" });
  });

  it("lists files whose class has the file's name", () => {
    const entries = [...pkg.n8n.credentials, ...pkg.n8n.nodes];
    expect(entries).toHaveLength(3);
    for (const entry of entries) {
      const source = sourceOf(entry);
      expect(existsSync(join(root, source)), source).toBe(true);
      const className = source.split("/").at(-1)?.split(".")[0] ?? "";
      expect(CLASSES[className], className).toBeDefined();
    }
  });
});

describe("node and credential descriptions", () => {
  const credential = new QrdxApi();
  const nodes: [string, INodeTypeDescription][] = [
    ["nodes/Qrdx/Qrdx.node.ts", new Qrdx().description],
    ["nodes/Qrdx/QrdxTrigger.node.ts", new QrdxTrigger().description],
  ];

  it("point at icons that exist", () => {
    for (const file of iconFiles(
      credential.icon,
      "credentials/QrdxApi.credentials.ts"
    )) {
      expect(existsSync(file), file).toBe(true);
    }
    for (const [source, description] of nodes) {
      for (const file of iconFiles(description.icon, source)) {
        expect(existsSync(file), file).toBe(true);
      }
    }
  });

  it("use the package's credential", () => {
    for (const [, description] of nodes) {
      expect(description.credentials?.map((c) => c.name)).toEqual([
        credential.name,
      ]);
    }
  });

  it("mark the API key as a password and test it with GET /me", () => {
    const apiKey = credential.properties.find((p) => p.name === "apiKey");
    expect(apiKey?.typeOptions?.password).toBe(true);
    expect(credential.test.request).toMatchObject({ url: "/me" });
  });

  it("make the action node usable as an AI tool", () => {
    expect(new Qrdx().description.usableAsTool).toBe(true);
  });

  it("keep QR and barcode images keyless: no credential for those resources", () => {
    const [entry] = new Qrdx().description.credentials ?? [];
    expect(entry?.displayOptions?.show?.resource).not.toContain("qrImage");
    expect(entry?.displayOptions?.show?.resource).not.toContain("barcodeImage");
  });
});

describe("image operations", () => {
  const { properties } = new Qrdx().description;

  /** The resource's parameter `name`. */
  function field(resource: string, name: string): INodeProperties {
    const found = properties.find(
      (p) =>
        p.name === name && p.displayOptions?.show?.resource?.includes(resource)
    );
    if (!found) throw new Error(`No ${name} field for ${resource}`);
    return found;
  }

  const values = (property: INodeProperties) =>
    (property.options as INodePropertyOptions[]).map((o) => o.value).sort();
  const names = (property: INodeProperties) =>
    (property.options as INodePropertyOptions[]).map((o) => o.name);
  const generate = (resource: string) =>
    (field(resource, "operation").options as INodePropertyOptions[]).find(
      (o) => o.value === "generate"
    );
  const option = (resource: string, name: string) =>
    (field(resource, "options").options as INodeProperties[]).find(
      (o) => o.name === name
    );

  it("offers every barcode format and file type in the node's lists", () => {
    expect(values(field("barcodeImage", "barcodeFormat"))).toEqual(
      [...BARCODE_FORMATS].sort()
    );
    expect(values(field("barcodeImage", "fileType"))).toEqual(
      [...BARCODE_FILE_TYPES].sort()
    );
  });

  it("describe Generate with every file type it makes", () => {
    for (const [resource, formatField] of [
      ["qrImage", "format"],
      ["barcodeImage", "fileType"],
    ] as const) {
      const description = generate(resource)?.description ?? "";
      for (const name of names(field(resource, formatField))) {
        expect(description, `${resource}: ${name}`).toContain(name);
      }
    }
  });

  it("start the barcode options at the API's limits", () => {
    expect(option("barcodeImage", "scale")).toMatchObject({
      default: BARCODE_SCALE.default,
      typeOptions: { minValue: BARCODE_SCALE.min, maxValue: BARCODE_SCALE.max },
    });
    expect(
      values(option("barcodeImage", "rotation") as INodeProperties)
    ).toEqual([...BARCODE_ROTATIONS].sort());
  });
});
