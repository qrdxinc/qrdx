// What goes inside the code: the text a phone reads when it scans it, for
// each content type the sidebar offers. The formats are the ones QRdx's MCP
// server builds (apps/app/app/api/mcp/payloads.ts: qr_payload_wifi,
// qr_payload_email, qr_payload_sms) and the editor's (tel: links), so a
// code made here scans the same as one made on qrdx.dev.
// apps/app/tests/plugins/google-workspace.test.ts holds this file to them.
//
// Plain JavaScript with no imports: Apps Script runs every file of the
// project in one global scope, and test/load.mjs runs them the same way
// under Node. No URL, URLSearchParams or TextEncoder: Apps Script has none.

/** The content types, in the order the sidebar lists them. */
const QR_TYPES = [
  { id: "url", label: "Link" },
  { id: "text", label: "Text" },
  { id: "wifi", label: "Wi-Fi network" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone call" },
  { id: "sms", label: "Text message (SMS)" },
];

/** Wi-Fi security, as the WIFI: format names it (T:). */
const WIFI_SECURITY = [
  { id: "WPA", label: "WPA or WPA2 (most networks)" },
  { id: "SAE", label: "WPA3 only" },
  { id: "WEP", label: "WEP (old networks)" },
  { id: "nopass", label: "None (open network)" },
];

/** The most `data` the image API takes, in characters. */
const QR_DATA_MAX_LENGTH = 2048;

const EMAIL_ADDRESS =
  /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

/** The number of bytes `value` takes in UTF-8. */
function utf8Length(value) {
  let bytes = 0;
  for (const char of String(value)) {
    const code = char.codePointAt(0);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/** A form value as a trimmed string ("" when missing). */
function fieldText(fields, name) {
  const value = fields?.[name];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * A web address as the QRdx editor writes it: trimmed, with https:// added
 * when no scheme was typed ("example.com/menu"). A host with a dot before
 * the colon ("example.com:8080") or a number after it ("localhost:3000") is
 * a host and port, not a scheme.
 */
function normalizeLink(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const scheme = /^([a-z][a-z\d+.-]*):(.*)$/is.exec(value);
  const hasScheme =
    scheme !== null &&
    !scheme[1].includes(".") &&
    !/^\d+(?:[/?#]|$)/.test(scheme[2]);
  return hasScheme ? value : `https://${value}`;
}

/**
 * A phone number for tel: and sms: links, as the MCP server's payload tools
 * take it: spaces, dots, dashes and brackets removed, then an optional "+"
 * and 3 to 15 digits. Null when it isn't one.
 */
function cleanPhone(raw) {
  const value = String(raw ?? "").replace(/[\s().-]/g, "");
  return /^\+?\d{3,15}$/.test(value) ? value : null;
}

/** Escapes \ ; , " and : for the WIFI: format. */
function escapeWifi(value) {
  return value.replace(/([\\;,":])/g, "\\$1");
}

/** An address for a mailto: link: encoded, with "@" kept readable. */
function mailtoAddress(address) {
  return encodeURIComponent(address).replace(/%40/g, "@");
}

const PHONE_HINT =
  "Enter a phone number with 3 to 15 digits, with the country code (+1 415 555 0123)";

/** One field's problem, for the sidebar to show. */
function problem(field, message) {
  return { ok: false, field, message };
}

function linkPayload(fields) {
  const link = normalizeLink(fieldText(fields, "url"));
  if (!link) return problem("url", "Enter the link the code should open");
  if (/\s/.test(link)) {
    return problem("url", "A link can't contain spaces");
  }
  return { ok: true, data: link, description: `QR code for ${link}`, link };
}

function textPayload(fields) {
  // Text keeps its line breaks and inner spaces; only the ends are trimmed.
  const text = String(fields?.text ?? "").trim();
  if (!text) return problem("text", "Enter the text the code should hold");
  return { ok: true, data: text, description: "QR code with text" };
}

function wifiProblem(security, ssid, password) {
  if (!ssid) return problem("ssid", "Enter the network name");
  if (utf8Length(ssid) > 32) {
    return problem("ssid", "A network name is at most 32 bytes long");
  }
  if (security === "nopass") return null;
  if (!password) return problem("password", "Enter the network's password");
  const hexKey = /^[0-9a-f]{64}$/i.test(password);
  if (
    security === "WPA" &&
    (password.length < 8 || password.length > 63) &&
    !hexKey
  ) {
    return problem("password", "WPA passwords are 8 to 63 characters long");
  }
  if (security === "SAE" && password.length > 63) {
    return problem("password", "WPA3 passwords are at most 63 characters long");
  }
  return null;
}

function wifiPayload(fields) {
  const ssid = String(fields?.ssid ?? "");
  // A password's spaces count, so it isn't trimmed.
  const password = String(fields?.password ?? "");
  const known = WIFI_SECURITY.some((option) => option.id === fields?.security);
  const security = known ? fields.security : "WPA";
  const found = wifiProblem(security, ssid.trim(), password);
  if (found) return found;
  const parts = [`T:${security}`, `S:${escapeWifi(ssid.trim())}`];
  if (fields?.hidden === true) parts.push("H:true");
  if (security !== "nopass") parts.push(`P:${escapeWifi(password)}`);
  return {
    ok: true,
    data: `WIFI:${parts.join(";")};;`,
    description: `QR code to join the Wi-Fi network ${ssid.trim()}`,
  };
}

function emailPayload(fields) {
  const to = fieldText(fields, "to");
  if (!to) return problem("to", "Enter the address the email goes to");
  if (!EMAIL_ADDRESS.test(to)) {
    return problem("to", "Enter one email address, like name@example.com");
  }
  const subject = fieldText(fields, "subject");
  if (subject.length > 255) {
    return problem("subject", "A subject is at most 255 characters long");
  }
  const body = String(fields?.body ?? "").trim();
  if (body.length > 1500) {
    return problem("body", "The message is at most 1,500 characters long");
  }
  const query = [];
  if (subject) query.push(`subject=${encodeURIComponent(subject)}`);
  if (body) {
    // RFC 6068: line breaks in the body are sent as %0D%0A.
    query.push(
      `body=${encodeURIComponent(body.replace(/\r\n|\r|\n/g, "\r\n"))}`
    );
  }
  const suffix = query.length > 0 ? `?${query.join("&")}` : "";
  return {
    ok: true,
    data: `mailto:${mailtoAddress(to)}${suffix}`,
    description: `QR code to email ${to}`,
  };
}

function phonePayload(fields) {
  const phone = cleanPhone(fieldText(fields, "phone"));
  if (!phone) return problem("phone", PHONE_HINT);
  return {
    ok: true,
    data: `tel:${phone}`,
    description: `QR code to call ${phone}`,
  };
}

function smsPayload(fields) {
  const phone = cleanPhone(fieldText(fields, "phone"));
  if (!phone) return problem("phone", PHONE_HINT);
  const message = String(fields?.message ?? "").trim();
  if (message.length > 1000) {
    return problem("message", "The message is at most 1,000 characters long");
  }
  return {
    ok: true,
    data: message
      ? `sms:${phone}?body=${encodeURIComponent(message)}`
      : `sms:${phone}`,
    description: `QR code to text ${phone}`,
  };
}

const PAYLOAD_BUILDERS = {
  url: linkPayload,
  text: textPayload,
  wifi: wifiPayload,
  email: emailPayload,
  phone: phonePayload,
  sms: smsPayload,
};

/**
 * The code's content for a type and the sidebar's fields:
 * { ok: true, data, description, link? } or { ok: false, field, message }.
 * `description` is the image's alt text; it never repeats a password.
 * `link` is set for links, so a Docs or Slides image can open it on click.
 */
function buildPayload(type, fields) {
  const build = PAYLOAD_BUILDERS[type];
  if (!build) return problem("type", "Pick what the code should do");
  const result = build(fields ?? {});
  if (result.ok && result.data.length > QR_DATA_MAX_LENGTH) {
    return problem(
      type === "url" ? "url" : "type",
      `That's ${result.data.length} characters; a code holds at most ${QR_DATA_MAX_LENGTH}. A dynamic code on qrdx.dev keeps long links short.`
    );
  }
  return result;
}
