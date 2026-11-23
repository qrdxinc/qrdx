// Apps Script checks each file's syntax when clasp pushes it, and its parser
// stops at ES2020: `?.` and `??` pass, but numeric separators (`0x8_00`,
// ES2021) failed the push on 24 Nov 2026 with "Unexpected token ILLEGAL".
// Node runs the newer syntax without complaint, so the other suites can't see
// it; this one parses every source file as an ES2020 script and names the
// line that's too new.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { parse } from "acorn";
import { SOURCE_FILES } from "./load.mjs";

const SRC = join(import.meta.dirname, "../src");

const SCRIPT_FILES = readdirSync(SRC)
  .filter((file) => file.endsWith(".js") || file.endsWith(".gs"))
  .sort();

/** The syntax error parsing `source` as an ES2020 script, or null. */
function syntaxError(source) {
  try {
    parse(source, { ecmaVersion: 2020, sourceType: "script", locations: true });
    return null;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return error;
  }
}

/** "src/payload.js:42:23: Identifier directly after number". */
const describeError = (file, error) =>
  `src/${file}:${error.loc.line}:${error.loc.column + 1}: ${error.message.replace(/ \(\d+:\d+\)$/, "")}. Apps Script's parser takes ES2020 syntax at most.`;

describe("syntax Apps Script accepts (ES2020 at most)", () => {
  it("covers every file the other suites load", () => {
    assert.ok(SOURCE_FILES.length > 0);
    for (const file of SOURCE_FILES) assert.ok(SCRIPT_FILES.includes(file));
  });

  for (const file of SCRIPT_FILES) {
    it(`parses src/${file} as ES2020`, () => {
      const error = syntaxError(readFileSync(join(SRC, file), "utf8"));
      if (error) assert.fail(describeError(file, error));
    });
  }

  it("fails on ES2021 syntax and passes what clasp push accepted", () => {
    assert.notEqual(syntaxError("code < 0x8_00;"), null);
    assert.notEqual(syntaxError("value ??= 1;"), null);
    assert.equal(syntaxError("const x = a?.b ?? c;"), null);
  });
});
