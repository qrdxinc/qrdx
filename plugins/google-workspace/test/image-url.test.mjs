// Image addresses, =IMAGE() formulas and the small helpers around them.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadAddon, plain } from "./load.mjs";

const get = loadAddon();

describe("image addresses", () => {
  const qrImageUrl = get("qrImageUrl");

  it("asks for a PNG with the preset's parameters and the encoded data last", () => {
    assert.equal(
      qrImageUrl("https://example.com/?a=1&b=2", "plain", 512),
      "https://api.qrdx.dev/v1/qr?format=png&size=512&data=https%3A%2F%2Fexample.com%2F%3Fa%3D1%26b%3D2"
    );
    assert.equal(
      qrImageUrl("hi", "slate", 300),
      "https://api.qrdx.dev/v1/qr?format=png&size=300&fg=0f172a&bg=f8fafc&eyeColor=3b82f6&dotColor=3b82f6&body=rounded&eye=rounded&dot=rounded&data=hi"
    );
  });

  it("falls back to the first preset and keeps sizes in the API's range", () => {
    const url = qrImageUrl("x", "gone", 10_000);
    assert.match(url, /size=2048&body=circle&eye=gear&dot=circle&data=x$/);
    assert.match(qrImageUrl("x", "plain", 3), /size=64&/);
  });

  it("encodes characters that would split the address", () => {
    const url = qrImageUrl("WIFI:T:WPA;S:a#b;P:c+d e;;", "plain", 512);
    assert.ok(
      url.endsWith("data=WIFI%3AT%3AWPA%3BS%3Aa%23b%3BP%3Ac%2Bd%20e%3B%3B")
    );
  });

  it("uses only hex colors without # and known parameter names", () => {
    const presets = plain(get("STYLE_PRESETS"));
    const order = plain(get("PRESET_PARAM_ORDER"));
    assert.ok(presets.length >= 3);
    assert.equal(
      new Set(presets.map((preset) => preset.id)).size,
      presets.length
    );
    for (const preset of presets) {
      for (const [name, value] of Object.entries(preset.params)) {
        assert.ok(order.includes(name), `${preset.id}: ${name}`);
        if (["fg", "bg", "eyeColor", "dotColor"].includes(name)) {
          assert.match(value, /^[0-9a-f]{6}$/, `${preset.id}: ${name}`);
        }
      }
    }
  });
});

describe("print sizes", () => {
  const fetchPixels = get("fetchPixels");

  it("fetches enough pixels for 300 dpi, at least 512", () => {
    assert.equal(fetchPixels(1), 512);
    assert.equal(fetchPixels(2), 600);
    assert.equal(fetchPixels(10), 2048);
  });

  it("offers small, medium and large, medium by default", () => {
    assert.equal(get("sizeById")("nope").id, "medium");
    assert.deepEqual(
      plain(get("CODE_SIZES")).map((size) => size.inches),
      [1, 1.5, 2]
    );
  });
});

describe("=IMAGE() formulas", () => {
  it("encode the cell to the left and stay blank while it's empty", () => {
    assert.equal(
      get("imageFormulaR1C1")("R[0]C[-1]", "plain", 192),
      '=IF(R[0]C[-1]="","",IMAGE("https://api.qrdx.dev/v1/qr?format=png&size=192&data="&ENCODEURL(R[0]C[-1])))'
    );
  });

  it("never put a double quote inside the formula's string", () => {
    for (const preset of plain(get("STYLE_PRESETS"))) {
      const formula = get("imageFormulaR1C1")("R[0]C[-1]", preset.id, 288);
      const inside = formula.slice(
        formula.indexOf('IMAGE("') + 7,
        formula.indexOf('"&ENCODEURL')
      );
      assert.ok(!inside.includes('"'), preset.id);
    }
  });
});

describe("helpers", () => {
  it("names columns", () => {
    const columnLetter = get("columnLetter");
    assert.equal(columnLetter(1), "A");
    assert.equal(columnLetter(26), "Z");
    assert.equal(columnLetter(27), "AA");
    assert.equal(columnLetter(703), "AAA");
  });

  it("counts cells that hold a value or a formula", () => {
    const count = get("countFilledCells");
    assert.equal(count([[""], [""]], [[""], [""]]), 0);
    assert.equal(count([["x"], [""], [0]], [[""], ['=""'], [""]]), 3);
  });

  it("turns API errors into sentences without the address", () => {
    const message = get("apiErrorMessage");
    const tooLong = JSON.stringify({
      code: "VALIDATION_ERROR",
      data: { details: [{ param: "data", message: "Data is too long…" }] },
    });
    assert.match(message(400, tooLong), /^That's more than one code can hold/);
    assert.match(message(400, "not json"), /couldn't make this code/);
    const otherParam = JSON.stringify({
      data: { details: [{ param: "size", message: "x" }] },
    });
    assert.match(message(400, otherParam), /couldn't make this code/);
    assert.match(message(429, ""), /Wait a minute/);
    assert.match(message(503, ""), /error 503/);
  });

  it("tags the dynamic-code link for sign-up analytics", () => {
    const link = get("DYNAMIC_CODE_URL");
    const url = new URL(link);
    assert.equal(url.origin + url.pathname, "https://qrdx.dev/dynamic-qr-code");
    assert.equal(url.searchParams.get("ref"), "google-workspace-addon");
    assert.equal(url.searchParams.get("utm_source"), "google-workspace");
    assert.equal(url.searchParams.get("utm_medium"), "addon");
    assert.equal(url.searchParams.get("utm_campaign"), "sidebar");
  });
});
