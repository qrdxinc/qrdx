// Run: cd apps/app && npx tsx --test components/sections/tools/tools.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BULK_STASH_MAX_AGE_MS,
  createFilenameAllocator,
  dataUrlToBytes,
  guessFilenameColumn,
  guessValueColumn,
  MAX_BULK_ROWS,
  MAX_SIGNED_OUT_ROWS,
  needsAccount,
  sanitizeFilename,
  stashBulkFile,
  takeBulkStash,
  toTable,
} from "./bulk-utils";
import { toPayload } from "./payload";

describe("toPayload", () => {
  it("terminates Wi-Fi records with ;; and escapes special characters", () => {
    assert.equal(
      toPayload("wifi", {
        type: "wifi",
        ssid: "Cafe Guest",
        password: "latte;art",
        encryption: "WPA",
        hidden: false,
      }),
      "WIFI:T:WPA;S:Cafe Guest;P:latte\\;art;H:false;;",
    );
    assert.equal(
      toPayload("wifi", {
        type: "wifi",
        ssid: "Open",
        password: "",
        encryption: "nopass",
      }),
      "WIFI:T:nopass;S:Open;;",
    );
  });

  it("writes EIP-681 values in wei and leaves exponents alone", () => {
    const address = "0xfb6916095ca1df60bb79Ce92ce3ea74c37c5d359";
    assert.equal(
      toPayload("ethereum", {
        type: "ethereum",
        address,
        amount: "0.05",
        gas: "21000",
      }),
      `ethereum:${address}?value=0.05e18&gas=21000`,
    );
    assert.equal(
      toPayload("ethereum", { type: "ethereum", address, amount: "2.014e18" }),
      `ethereum:${address}?value=2.014e18`,
    );
    assert.equal(
      toPayload("ethereum", { type: "ethereum", address }),
      `ethereum:${address}`,
    );
  });

  it("removes spaces from Google Maps coordinates", () => {
    assert.equal(
      toPayload("maps", { type: "maps", location: "48.8584, 2.2945" }),
      "https://www.google.com/maps?q=48.8584,2.2945",
    );
    assert.equal(
      toPayload("maps", { type: "maps", location: "Eiffel Tower, Paris" }),
      "https://www.google.com/maps/search/?api=1&query=Eiffel%20Tower%2C%20Paris",
    );
  });

  it("returns nothing for a missing or mismatched config", () => {
    assert.equal(toPayload("wifi", undefined), "");
    assert.equal(toPayload("wifi", { type: "text", text: "hi" }), "");
  });
});

describe("bulk helpers", () => {
  it("builds a table with header names and a row cap", () => {
    const rows = [
      ["url", "name"],
      ...Array.from({ length: MAX_BULK_ROWS + 1 }, (_, i) => [
        `https://e.com/${i}`,
        `n${i}`,
      ]),
    ];
    const table = toTable(rows, true);
    assert.deepEqual(table.columns, ["url", "name"]);
    assert.equal(table.rows.length, MAX_BULK_ROWS);
    assert.equal(table.truncated, true);
    assert.deepEqual(toTable([["a"], ["b", "c"]], false).columns, [
      "Column 1",
      "Column 2",
    ]);
  });

  it("guesses value and file name columns", () => {
    const columns = ["sku", "link"];
    assert.equal(guessValueColumn(columns), 1);
    assert.equal(guessFilenameColumn(columns, 1), 0);
    assert.equal(guessFilenameColumn(["x", "y"], 0), -1);
  });

  it("sanitizes and de-duplicates file names", () => {
    assert.equal(
      sanitizeFilename('  ../menu: "table" 1?  '),
      "menu- -table- 1-",
    );
    assert.equal(sanitizeFilename("..."), "");
    const allocate = createFilenameAllocator();
    assert.equal(allocate("menu", "png"), "menu.png");
    assert.equal(allocate("Menu", "png"), "Menu-2.png");
    assert.equal(allocate("menu-2", "png"), "menu-2-2.png");
    assert.equal(allocate("menu", "png"), "menu-3.png");
  });

  it("decodes base64 and URI-encoded data URLs", () => {
    assert.deepEqual(
      Array.from(dataUrlToBytes("data:image/png;base64,AQID")),
      [1, 2, 3],
    );
    assert.equal(
      new TextDecoder().decode(
        dataUrlToBytes("data:image/svg+xml,%3Csvg%2F%3E"),
      ),
      "<svg/>",
    );
  });
});

describe("bulk sign-in gate", () => {
  it("asks signed-out visitors for an account above the limit only", () => {
    assert.equal(MAX_SIGNED_OUT_ROWS, 500);
    assert.ok(MAX_SIGNED_OUT_ROWS < MAX_BULK_ROWS);
    assert.equal(needsAccount(MAX_SIGNED_OUT_ROWS, false), false);
    assert.equal(needsAccount(MAX_SIGNED_OUT_ROWS + 1, false), true);
    // Signed in, the file cap (MAX_BULK_ROWS, via toTable) is the only one.
    assert.equal(needsAccount(MAX_BULK_ROWS, true), false);
  });

  const fakeStorage = (quota = Number.POSITIVE_INFINITY) => {
    const store = new Map<string, string>();
    return {
      store,
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (value.length > quota) throw new Error("QuotaExceededError");
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    };
  };
  const file = {
    name: "menu.csv",
    rows: [["url"], ["https://e.com/1"], ["https://e.com/2"]],
    hasHeader: true,
  };

  it("keeps the file through a sign-in's round trip, once", () => {
    const storage = fakeStorage();
    stashBulkFile(file, 1000, storage);
    assert.deepEqual(takeBulkStash(2000, storage), file);
    // Taken: it's gone from the tab.
    assert.equal(takeBulkStash(2000, storage), null);
    assert.equal(storage.store.size, 0);
  });

  it("doesn't bring back an old or malformed file", () => {
    const storage = fakeStorage();
    stashBulkFile(file, 1000, storage);
    assert.equal(
      takeBulkStash(1000 + BULK_STASH_MAX_AGE_MS + 1, storage),
      null,
    );
    storage.store.set(
      "qrdx:bulk-file",
      JSON.stringify({ name: "x", rows: [[1, 2]], at: 1000 }),
    );
    assert.equal(takeBulkStash(2000, storage), null);
    storage.store.set("qrdx:bulk-file", "{");
    assert.equal(takeBulkStash(2000, storage), null);
  });

  it("says when the file was too big to keep", () => {
    const storage = fakeStorage(100);
    stashBulkFile(
      { ...file, rows: Array.from({ length: 50 }, () => ["https://e.com"]) },
      1000,
      storage,
    );
    assert.equal(takeBulkStash(2000, storage), "lost");
  });

  it("never throws without storage", () => {
    assert.doesNotThrow(() => stashBulkFile(file, 1000, null));
    assert.equal(takeBulkStash(2000, null), null);
  });
});
