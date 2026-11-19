// The email preview server (apps/email) runs on @react-email/ui, which pins
// its own Next.js; the root package.json overrides that to the app's Next so
// installs don't carry a second copy. When the app's Next moves, the
// override must move with it.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  JSON.parse(
    readFileSync(path.resolve(import.meta.dirname, "../../..", file), "utf8"),
  );

describe("the email preview's Next.js override", () => {
  it("is the app's Next.js version", () => {
    const root = read("../package.json");
    const app = read("app/package.json");
    expect(root.overrides["@react-email/ui>next"]).toBe(app.dependencies.next);
  });
});
