// The sidebar and what Insert does in each app, against fakes of the Apps
// Script services (Card, UrlFetch, Document, Slides, Spreadsheet). Apps
// Script itself can't run here; README.md has the manual test plan for the
// real thing.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  actionEvent,
  argsOf,
  buttonAction,
  fakeCardService,
  fakeUrlFetch,
  fieldNamesOf,
  loadAddon,
  nodesOf,
  textsOf,
} from "./load.mjs";

const manifest = JSON.parse(
  readFileSync(join(import.meta.dirname, "../src/appsscript.json"), "utf8")
);

/** The add-on with fakes; `hosts` adds DocumentApp, SlidesApp or SpreadsheetApp. */
function setUp({ status = 200, body = "", hosts = {}, reverse = false } = {}) {
  const fetch = fakeUrlFetch({ status, body });
  const get = loadAddon(
    {
      CardService: fakeCardService(),
      UrlFetchApp: fetch.UrlFetchApp,
      Utilities: {
        base64Encode: (bytes) => Buffer.from(bytes).toString("base64"),
      },
      ...hosts,
    },
    { reverse }
  );
  return { get, fetch };
}

/** The sentence an action response shows. */
function notification(response) {
  const [note] = argsOf(response, "setNotification");
  assert.ok(note, "expected a notification");
  return argsOf(note, "setText")[0];
}

/** An object whose every method records its call and returns the object. */
function chain(kind, log) {
  const proxy = new Proxy(
    {},
    {
      get:
        (_target, method) =>
        (...args) => {
          log.push([kind, method, ...args]);
          return proxy;
        },
    }
  );
  return proxy;
}

describe("the sidebar", () => {
  it("loads whatever order Apps Script runs the files in", () => {
    for (const reverse of [false, true]) {
      const { get } = setUp({ reverse });
      const card = get("onHomepage")(actionEvent("docs"));
      assert.equal(card.kind, "CardBuilder");
    }
  });

  it("starts with a link, the look and the size", () => {
    const { get } = setUp();
    const card = get("onHomepage")(actionEvent("docs"));
    assert.deepEqual(fieldNamesOf(card), ["type", "url", "style", "size"]);
    assert.equal(buttonAction(card, "Insert at cursor"), "onInsert");
    assert.equal(buttonAction(card, "Preview"), "onPreview");
    assert.equal(buttonAction(card, "Add =IMAGE() formulas"), undefined);
    assert.ok(
      textsOf(card).some((text) => text.includes("sent to QRdx's image API"))
    );
  });

  it("offers formulas in Sheets and names each app's Insert", () => {
    const { get } = setUp();
    const sheets = get("onHomepage")(actionEvent("sheets"));
    assert.equal(buttonAction(sheets, "Insert over sheet"), "onInsert");
    assert.equal(
      buttonAction(sheets, "Add =IMAGE() formulas"),
      "onWriteFormulas"
    );
    assert.ok(
      textsOf(sheets).some((text) =>
        text.endsWith(
          "If Sheets warns that formulas are trying to reach external parties, click Allow access; until then the cells show #REF!."
        )
      )
    );
    const slides = get("onHomepage")(actionEvent("slides"));
    assert.equal(buttonAction(slides, "Add to slide"), "onInsert");
  });

  it("links to dynamic codes on qrdx.dev, inside openLinkUrlPrefixes", () => {
    const { get } = setUp();
    const card = get("onHomepage")(actionEvent("docs"));
    const urls = nodesOf(card).flatMap((node) => argsOf(node, "setUrl"));
    assert.deepEqual(urls, [get("DYNAMIC_CODE_URL")]);
    const prefixes = manifest.addOns.common.openLinkUrlPrefixes;
    for (const url of urls) {
      assert.ok(
        prefixes.some((prefix) => url.startsWith(prefix)),
        url
      );
    }
    for (const action of manifest.addOns.common.universalActions) {
      assert.ok(prefixes.some((prefix) => action.openLink.startsWith(prefix)));
    }
    assert.ok(
      textsOf(card).includes(
        "Need to change the link after printing or count scans? Make a dynamic code on qrdx.dev."
      )
    );
  });

  it("shows the new type's fields and keeps the look when the type changes", () => {
    const { get } = setUp();
    const response = get("onTypeChange")(
      actionEvent("docs", { type: "wifi", style: "green", size: "large" })
    );
    const [navigation] = argsOf(response, "setNavigation");
    const [card] = argsOf(navigation, "updateCard");
    assert.deepEqual(fieldNamesOf(card), [
      "type",
      "ssid",
      "password",
      "security",
      "hidden",
      "style",
      "size",
    ]);
    const selected = nodesOf(card)
      .filter((node) => node.kind === "SelectionInput")
      .flatMap((node) =>
        node.calls.filter((call) => call[0] === "addItem" && call[3] === true)
      )
      .map((call) => call[2]);
    assert.deepEqual(selected, ["wifi", "WPA", "green", "large"]);
  });

  it("previews the code without inserting it", () => {
    const { get, fetch } = setUp();
    const response = get("onPreview")(
      actionEvent("docs", { type: "url", url: "qrdx.dev" })
    );
    assert.equal(fetch.requests.length, 1);
    assert.match(
      fetch.requests[0].url,
      /size=256&.*data=https%3A%2F%2Fqrdx\.dev$/
    );
    const [navigation] = argsOf(response, "setNavigation");
    const [card] = argsOf(navigation, "updateCard");
    const image = nodesOf(card).find((node) => node.kind === "Image");
    assert.equal(
      argsOf(image, "setImageUrl")[0],
      "data:image/png;base64,iVBORw=="
    );
    assert.equal(
      argsOf(image, "setAltText")[0],
      "QR code for https://qrdx.dev"
    );
  });
});

describe("Insert in Docs", () => {
  function docs({ cursor = true, inserted = true, status, body } = {}) {
    const log = [];
    const image = chain("image", log);
    const DocumentApp = {
      getActiveDocument: () => ({
        getCursor: () =>
          cursor
            ? {
                insertInlineImage: (blob) => {
                  log.push(["cursor", "insertInlineImage", blob.name]);
                  return inserted ? image : null;
                },
              }
            : null,
      }),
    };
    return { ...setUp({ status, body, hosts: { DocumentApp } }), log };
  }

  it("inserts the fetched PNG at the cursor, sized, described and linked", () => {
    const { get, fetch, log } = docs();
    const response = get("onInsert")(
      actionEvent("docs", {
        type: "url",
        url: "example.com/menu",
        style: "blue",
        size: "medium",
      })
    );
    assert.equal(notification(response), "QR code inserted.");
    assert.equal(
      fetch.requests[0].url,
      "https://api.qrdx.dev/v1/qr?format=png&size=512&fg=0051ff&body=rounded&eye=extra-rounded&dot=rounded&data=https%3A%2F%2Fexample.com%2Fmenu"
    );
    assert.equal(fetch.requests[0].options.muteHttpExceptions, true);
    assert.deepEqual(log, [
      ["cursor", "insertInlineImage", "qr-code.png"],
      ["image", "setWidth", 144],
      ["image", "setHeight", 144],
      ["image", "setAltTitle", "QR code"],
      ["image", "setAltDescription", "QR code for https://example.com/menu"],
      ["image", "setLinkUrl", "https://example.com/menu"],
    ]);
  });

  it("doesn't link a Wi-Fi code, and reads the hidden checkbox", () => {
    const { get, fetch, log } = docs();
    get("onInsert")(
      actionEvent("docs", {
        type: "wifi",
        ssid: "Home",
        password: "longenough",
        security: "WPA",
        hidden: ["true"],
      })
    );
    assert.ok(
      fetch.requests[0].url.endsWith(
        `data=${encodeURIComponent("WIFI:T:WPA;S:Home;H:true;P:longenough;;")}`
      )
    );
    assert.ok(!log.some((entry) => entry[1] === "setLinkUrl"));
  });

  it("asks for a cursor before sending anything to QRdx", () => {
    const { get, fetch } = docs({ cursor: false });
    const response = get("onInsert")(
      actionEvent("docs", { type: "url", url: "a.com" })
    );
    assert.match(notification(response), /Click in the document/);
    assert.equal(fetch.requests.length, 0);
  });

  it("says when the cursor's spot takes no image", () => {
    const { get } = docs({ inserted: false });
    const response = get("onInsert")(
      actionEvent("docs", { type: "url", url: "a.com" })
    );
    assert.match(notification(response), /can't go at that spot/);
  });

  it("shows the field's problem and fetches nothing", () => {
    const { get, fetch } = docs();
    const response = get("onInsert")(
      actionEvent("docs", { type: "email", to: "nope" })
    );
    assert.equal(
      notification(response),
      "Enter one email address, like name@example.com"
    );
    assert.equal(fetch.requests.length, 0);
  });

  it("explains content that doesn't fit in a code", () => {
    const body = JSON.stringify({
      data: {
        details: [
          {
            param: "data",
            message:
              "Data is too long for a QR code at error correction level Q.",
          },
        ],
      },
    });
    const { get, log } = docs({ status: 400, body });
    const response = get("onInsert")(
      actionEvent("docs", { type: "text", text: "x" })
    );
    assert.match(notification(response), /^That's more than one code can hold/);
    assert.equal(log.length, 0);
  });
});

describe("Insert in Slides", () => {
  it("centers the code on the current slide and selects it", () => {
    const log = [];
    const image = chain("image", log);
    const SlidesApp = {
      getActivePresentation: () => ({
        getPageWidth: () => 720,
        getPageHeight: () => 405,
        getSelection: () => ({
          getCurrentPage: () => ({
            insertImage: (blob) => {
              log.push(["page", "insertImage", blob.name]);
              return image;
            },
          }),
        }),
      }),
    };
    const { get } = setUp({ hosts: { SlidesApp } });
    const response = get("onInsert")(
      actionEvent("slides", {
        type: "phone",
        phone: "+1 415 555 0123",
        size: "medium",
      })
    );
    assert.equal(notification(response), "QR code added to the slide.");
    assert.deepEqual(log, [
      ["page", "insertImage", "qr-code.png"],
      ["image", "setWidth", 108],
      ["image", "setHeight", 108],
      ["image", "setLeft", 306],
      ["image", "setTop", 148.5],
      ["image", "setTitle", "QR code"],
      ["image", "setDescription", "QR code to call +14155550123"],
      ["image", "select"],
    ]);
  });

  it("asks for a slide when none is selected", () => {
    const SlidesApp = {
      getActivePresentation: () => ({
        getSelection: () => ({ getCurrentPage: () => null }),
      }),
    };
    const { get, fetch } = setUp({ hosts: { SlidesApp } });
    const response = get("onInsert")(
      actionEvent("slides", { type: "text", text: "hi" })
    );
    assert.equal(notification(response), "Select a slide, then insert again.");
    assert.equal(fetch.requests.length, 0);
  });
});

describe("Sheets", () => {
  it("places one code over the sheet at the current cell", () => {
    const log = [];
    const image = chain("image", log);
    const sheet = {
      insertImage: (blob, column, row) => {
        log.push(["sheet", "insertImage", blob.name, column, row]);
        return image;
      },
    };
    const SpreadsheetApp = {
      getActiveSpreadsheet: () => ({
        getCurrentCell: () => ({
          getSheet: () => sheet,
          getColumn: () => 2,
          getRow: () => 3,
        }),
      }),
      flush: () => log.push(["SpreadsheetApp", "flush"]),
    };
    const { get } = setUp({ hosts: { SpreadsheetApp } });
    const response = get("onInsert")(
      actionEvent("sheets", { type: "url", url: "qrdx.dev", size: "small" })
    );
    assert.equal(notification(response), "QR code placed over cell B3.");
    assert.deepEqual(log, [
      ["sheet", "insertImage", "qr-code.png", 2, 3],
      ["image", "setWidth", 96],
      ["image", "setHeight", 96],
      ["image", "setAltTextTitle", "QR code"],
      ["image", "setAltTextDescription", "QR code for https://qrdx.dev"],
      // Sheets shows the image only once pending changes are applied.
      ["SpreadsheetApp", "flush"],
    ]);
  });

  /** A one-sheet spreadsheet whose active range is `rows` × `columns` at (row, column). */
  function sheetWith({
    row = 2,
    column = 1,
    rows = 3,
    columns = 1,
    maxColumns = 26,
    targetValues,
  } = {}) {
    const log = [];
    const sheet = {
      getMaxColumns: () => maxColumns,
      insertColumnAfter: (after) => log.push(["insertColumnAfter", after]),
      getRange: (r, c, n, w) => {
        log.push(["getRange", r, c, n, w]);
        const values = targetValues ?? Array.from({ length: n }, () => [""]);
        return {
          getValues: () => values,
          getFormulas: () => values.map(() => [""]),
          setFormulaR1C1: (formula) => log.push(["setFormulaR1C1", formula]),
        };
      },
      setColumnWidth: (c, px) => log.push(["setColumnWidth", c, px]),
      setRowHeights: (r, n, px) => log.push(["setRowHeights", r, n, px]),
    };
    const range = {
      getSheet: () => sheet,
      getRow: () => row,
      getColumn: () => column,
      getNumRows: () => rows,
      getNumColumns: () => columns,
    };
    const SpreadsheetApp = {
      getActiveSpreadsheet: () => ({ getActiveRange: () => range }),
    };
    return { ...setUp({ hosts: { SpreadsheetApp } }), log };
  }

  it("writes one =IMAGE() formula per row in the next column and sizes the cells", () => {
    const { get, fetch, log } = sheetWith();
    const response = get("onWriteFormulas")(
      actionEvent("sheets", { style: "plain", size: "small" })
    );
    assert.equal(
      notification(response),
      "Added 3 codes in column B. If Sheets asks, click Allow access at the top so it can load them from api.qrdx.dev."
    );
    assert.deepEqual(log, [
      ["getRange", 2, 2, 3, 1],
      [
        "setFormulaR1C1",
        '=IF(R[0]C[-1]="","",IMAGE("https://api.qrdx.dev/v1/qr?format=png&size=192&data="&ENCODEURL(R[0]C[-1])))',
      ],
      ["setColumnWidth", 2, 96],
      ["setRowHeights", 2, 3, 96],
    ]);
    // The add-on itself fetches nothing: Sheets loads the images.
    assert.equal(fetch.requests.length, 0);
  });

  it("never overwrites cells that hold something", () => {
    const { get, log } = sheetWith({ targetValues: [[""], ["keep me"], [""]] });
    const response = get("onWriteFormulas")(actionEvent("sheets"));
    assert.match(
      notification(response),
      /^Column B already has something in 1 of these rows/
    );
    assert.ok(!log.some((entry) => entry[0] === "setFormulaR1C1"));
  });

  it("adds a column when the list is in the last one", () => {
    const { get, log } = sheetWith({ column: 26, maxColumns: 26 });
    get("onWriteFormulas")(actionEvent("sheets"));
    assert.deepEqual(log[0], ["insertColumnAfter", 26]);
    assert.deepEqual(log[1], ["getRange", 2, 27, 3, 1]);
  });

  it("wants one column and at most 500 rows", () => {
    const wide = sheetWith({ columns: 2 });
    assert.match(
      notification(wide.get("onWriteFormulas")(actionEvent("sheets"))),
      /one column/
    );
    const long = sheetWith({ rows: 501 });
    assert.equal(
      notification(long.get("onWriteFormulas")(actionEvent("sheets"))),
      "Select at most 500 rows at a time (you selected 501)."
    );
  });

  it("are only offered in Sheets", () => {
    const { get } = setUp();
    assert.equal(
      notification(get("onWriteFormulas")(actionEvent("docs"))),
      "Formulas are for Google Sheets."
    );
  });
});

describe("addresses too long for UrlFetchApp", () => {
  // In the Classic look the address is 84 characters before the content.
  const digits = (count) => "1234567890".repeat(count / 10 + 1).slice(0, count);
  const tooLong = (needed) =>
    `This is too long for the add-on: Google limits the image's web address to 2,000 characters, and this content needs ${needed} once encoded. Shorten it, or make a dynamic code on qrdx.dev, which keeps long links short.`;

  it("refuses to preview 2,000 characters, without a request", () => {
    const { get, fetch } = setUp();
    const response = get("onPreview")(
      actionEvent("docs", { type: "text", text: digits(2000) })
    );
    assert.equal(notification(response), tooLong("2,084"));
    assert.equal(fetch.requests.length, 0);
  });

  it("refuses to insert them in every app before touching the file", () => {
    // No DocumentApp, SlidesApp or SpreadsheetApp: a placer that ran would fail.
    for (const host of ["docs", "slides", "sheets"]) {
      const { get, fetch } = setUp();
      const response = get("onInsert")(
        actionEvent(host, { type: "text", text: digits(2000), size: "large" })
      );
      assert.equal(notification(response), tooLong("2,084"), host);
      assert.equal(fetch.requests.length, 0, host);
    }
  });

  it("fetches an address of exactly 2,000 characters", () => {
    const { get, fetch } = setUp();
    const response = get("onPreview")(
      actionEvent("docs", { type: "text", text: digits(1916) })
    );
    assert.equal(fetch.requests.length, 1);
    assert.equal(fetch.requests[0].url.length, 2000);
    assert.ok(argsOf(response, "setNavigation").length > 0);
    const over = setUp();
    assert.equal(
      notification(
        over.get("onPreview")(
          actionEvent("docs", { type: "text", text: digits(1917) })
        )
      ),
      tooLong("2,001")
    );
    assert.equal(over.fetch.requests.length, 0);
  });

  it("measures the encoded address, not the characters typed", () => {
    // 400 "é" pass the 2,048-character check but encode to 2,400 (%C3%A9 each).
    const { get, fetch } = setUp();
    const response = get("onPreview")(
      actionEvent("docs", { type: "text", text: "é".repeat(400) })
    );
    assert.equal(notification(response), tooLong("2,484"));
    assert.equal(fetch.requests.length, 0);
  });

  it("leaves content over 2,048 characters to the payload's own message", () => {
    const { get, fetch } = setUp();
    const response = get("onPreview")(
      actionEvent("docs", { type: "text", text: digits(2100) })
    );
    assert.match(
      notification(response),
      /^That's 2100 characters; a code holds at most 2048\./
    );
    assert.equal(fetch.requests.length, 0);
  });
});

describe("the manifest", () => {
  it("asks only for the open file and requests to the image API", () => {
    assert.deepEqual(manifest.oauthScopes, [
      "https://www.googleapis.com/auth/documents.currentonly",
      "https://www.googleapis.com/auth/presentations.currentonly",
      "https://www.googleapis.com/auth/spreadsheets.currentonly",
      "https://www.googleapis.com/auth/script.external_request",
    ]);
    assert.deepEqual(manifest.urlFetchWhitelist, [
      "https://api.qrdx.dev/v1/qr",
    ]);
    const { get } = setUp();
    assert.ok(get("QR_IMAGE_API").startsWith(manifest.urlFetchWhitelist[0]));
  });

  it("names functions that exist", () => {
    const { get } = setUp();
    const names = [
      manifest.addOns.common.homepageTrigger.runFunction,
      ...["docs", "sheets", "slides"].map(
        (host) => manifest.addOns[host].homepageTrigger.runFunction
      ),
      "onTypeChange",
      "onPreview",
      "onInsert",
      "onWriteFormulas",
    ];
    for (const name of names) assert.equal(typeof get(name), "function", name);
  });
});
