// The code's content for each type. The expected strings are what QRdx's
// MCP server returned for the same input (qr_payload_wifi, qr_payload_email,
// qr_payload_sms on 23 Nov 2026); apps/app/tests/plugins/google-workspace.test.ts
// also compares the two directly.

import assert from "node:assert/strict";
import { describe, it, it as test } from "node:test";
import { loadAddon, plain } from "./load.mjs";

const get = loadAddon();
const buildPayload = get("buildPayload");
const build = (type, fields) => plain(buildPayload(type, fields));
const dataOf = (type, fields) => {
  const result = build(type, fields);
  assert.equal(result.ok, true, result.message);
  return result.data;
};

describe("links", () => {
  it("adds https:// when no scheme was typed, as the editor does", () => {
    assert.equal(
      dataOf("url", { url: " example.com/menu " }),
      "https://example.com/menu"
    );
    assert.equal(
      dataOf("url", { url: "localhost:3000/a" }),
      "https://localhost:3000/a"
    );
    assert.equal(
      dataOf("url", { url: "http://example.com" }),
      "http://example.com"
    );
    assert.equal(
      dataOf("url", { url: "mailto:ana@example.com" }),
      "mailto:ana@example.com"
    );
  });

  it("keeps the link for the image's click-through and alt text", () => {
    const result = build("url", { url: "qrdx.dev" });
    assert.equal(result.link, "https://qrdx.dev");
    assert.equal(result.description, "QR code for https://qrdx.dev");
  });

  it("asks for a link, and refuses one with spaces", () => {
    assert.deepEqual(build("url", { url: "  " }), {
      ok: false,
      field: "url",
      message: "Enter the link the code should open",
    });
    assert.equal(build("url", { url: "example.com/a b" }).ok, false);
  });

  it("refuses content longer than the image API takes", () => {
    const result = build("url", { url: `example.com/${"a".repeat(2100)}` });
    assert.equal(result.ok, false);
    assert.match(result.message, /at most 2048/);
  });
});

describe("text", () => {
  it("keeps inner line breaks and trims the ends", () => {
    assert.equal(
      dataOf("text", { text: "  Line 1\nLine 2  " }),
      "Line 1\nLine 2"
    );
    assert.equal(build("text", { text: "" }).ok, false);
  });

  it("doesn't repeat the text in the alt text", () => {
    assert.equal(
      build("text", { text: "secret" }).description,
      "QR code with text"
    );
  });
});

describe("Wi-Fi", () => {
  it("escapes and orders fields like qr_payload_wifi", () => {
    assert.equal(
      dataOf("wifi", {
        ssid: 'Café; "Guest", 2:4',
        password: "p\\ss;word,1",
        security: "WPA",
        hidden: true,
      }),
      'WIFI:T:WPA;S:Café\\; \\"Guest\\"\\, 2\\:4;H:true;P:p\\\\ss\\;word\\,1;;'
    );
  });

  it("leaves the password out of open networks", () => {
    assert.equal(
      dataOf("wifi", {
        ssid: "Open Lobby",
        password: "ignored",
        security: "nopass",
      }),
      "WIFI:T:nopass;S:Open Lobby;;"
    );
  });

  it("checks passwords per security type", () => {
    const wifi = (security, password) =>
      build("wifi", { ssid: "Home", security, password });
    assert.equal(wifi("WPA", "short").ok, false);
    assert.equal(wifi("WPA", "z".repeat(64)).ok, false);
    assert.equal(wifi("WPA", "ab".repeat(32)).ok, true); // 64 hex digits
    assert.equal(wifi("WPA", "").field, "password");
    assert.equal(wifi("WEP", "").ok, false);
    assert.equal(wifi("SAE", "short").ok, true);
    assert.equal(wifi("SAE", "a".repeat(64)).ok, false);
    // An unknown security falls back to WPA.
    assert.match(wifi("bogus", "longenough").data, /^WIFI:T:WPA;/);
  });

  it("limits the network name to 32 bytes, counting UTF-8", () => {
    assert.equal(
      build("wifi", { ssid: "é".repeat(16), security: "nopass" }).ok,
      true
    );
    assert.equal(
      build("wifi", { ssid: "é".repeat(17), security: "nopass" }).ok,
      false
    );
    assert.equal(
      build("wifi", { ssid: " ", security: "nopass" }).field,
      "ssid"
    );
  });

  it("names the network, never the password, in the alt text", () => {
    const result = build("wifi", { ssid: "Home", password: "hunter2hunter2" });
    assert.equal(result.description, "QR code to join the Wi-Fi network Home");
  });
});

describe("email", () => {
  it("builds the mailto: link qr_payload_email builds", () => {
    assert.equal(
      dataOf("email", {
        to: "ana+menu@example.com",
        subject: "Table 4 & more",
        body: "Hi,\ntwo lines",
      }),
      "mailto:ana%2Bmenu@example.com?subject=Table%204%20%26%20more&body=Hi%2C%0D%0Atwo%20lines"
    );
    assert.equal(
      dataOf("email", { to: "ana@example.com" }),
      "mailto:ana@example.com"
    );
  });

  it("checks the address and lengths", () => {
    assert.equal(build("email", { to: "not an address" }).field, "to");
    assert.equal(
      build("email", { to: "a@example.com", subject: "s".repeat(256) }).field,
      "subject"
    );
    assert.equal(
      build("email", { to: "a@example.com", body: "b".repeat(1501) }).field,
      "body"
    );
  });
});

describe("phone and SMS", () => {
  it("builds tel: links without separators", () => {
    assert.equal(
      dataOf("phone", { phone: "+1 (415) 555-0123" }),
      "tel:+14155550123"
    );
    assert.equal(build("phone", { phone: "12" }).ok, false);
    assert.equal(build("phone", { phone: "call me" }).ok, false);
  });

  it("builds the sms: link qr_payload_sms builds", () => {
    assert.equal(
      dataOf("sms", {
        phone: "+1 (415) 555-0123",
        message: "Book table 4 & 5?",
      }),
      "sms:+14155550123?body=Book%20table%204%20%26%205%3F"
    );
    assert.equal(dataOf("sms", { phone: "+14155550123" }), "sms:+14155550123");
    assert.equal(
      build("sms", { phone: "+14155550123", message: "m".repeat(1001) }).field,
      "message"
    );
  });
});

test("asks for a type it knows", () => {
  assert.equal(build("vcard", {}).ok, false);
});
