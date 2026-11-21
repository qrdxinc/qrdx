// The interactive prompts' option lists (src/lib/id-options.ts): one option
// per id, labelled with it, and typed per id, so a catalogue of more than 25
// ids still checks against @clack/prompts' option union without a cast.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  BODY_PATTERN,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
} from "qrdx";
import { describe, expect, it } from "vitest";
import { idOptions } from "../src/lib/id-options";

describe("idOptions", () => {
  it("lists every id once, in order, labelled with the id", () => {
    for (const ids of [
      BODY_PATTERN,
      CORNER_EYE_PATTERNS,
      CORNER_EYE_DOT_PATTERNS,
    ]) {
      expect(idOptions(ids)).toEqual(
        ids.map((id) => ({ value: id, label: id }))
      );
    }
  });

  it("type-checks each list against its own catalogue only", () => {
    // tests/fixtures/id-options/check.ts assigns each list to the prompt's
    // option type, and a list from the wrong catalogue under @ts-expect-error:
    // a cast inside idOptions would leave those unused and fail this.
    const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
    const project = join(
      import.meta.dirname,
      "fixtures/id-options/tsconfig.json"
    );
    let errors = "";
    try {
      execFileSync(process.execPath, [tsc, "--noEmit", "-p", project], {
        stdio: "pipe",
      });
    } catch (error) {
      errors = String((error as { stdout?: Buffer }).stdout ?? error);
    }
    expect(errors).toBe("");
  }, 60_000);
});
