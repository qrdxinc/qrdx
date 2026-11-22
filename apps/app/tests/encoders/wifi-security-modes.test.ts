// Wi-Fi security modes added 2026-11-22: WPA3-only networks (T:SAE, the
// Wi-Fi Alliance WPA3 specification's QR format, which Android's own Wi-Fi
// QR parser reads) and WPA2/WPA3-Enterprise (T:WPA2-EAP with ZXing's E:,
// PH2:, A: and I: fields, github.com/zxing/zxing/wiki/Barcode-Contents).
// The modes that were there before keep their exact payloads.
import { describe, expect, it } from "vitest";
import { buildWifiPayload, wifiPayloadSchema } from "@/app/api/mcp/payloads";
import { parseScan } from "@/components/scanner/parse";
import { validateDesignContent } from "@/lib/qr-design/content";
import { wifiSchema } from "@/lib/validations/qr-content";
import type { WifiContent } from "@/types/qr-content";
import {
  encodeWifi,
  validateContent,
  wifiIssue,
} from "@/utils/qr-content-encoder";

const wifi = (overrides: Partial<WifiContent>): WifiContent => ({
  type: "wifi",
  ssid: "Home",
  password: "pa55word",
  encryption: "WPA",
  ...overrides,
});

describe("saved codes keep their payloads", () => {
  it.each([
    [wifi({}), "WIFI:T:WPA;S:Home;P:pa55word;H:false;;"],
    [wifi({ hidden: true }), "WIFI:T:WPA;S:Home;P:pa55word;H:true;;"],
    [
      wifi({ encryption: "WEP", password: "abcde" }),
      "WIFI:T:WEP;S:Home;P:abcde;H:false;;",
    ],
    [wifi({ encryption: "nopass", password: "" }), "WIFI:T:nopass;S:Home;;"],
    [
      wifi({ encryption: "nopass", password: "", hidden: true }),
      "WIFI:T:nopass;S:Home;H:true;;",
    ],
  ])("%j", (content, payload) => {
    expect(encodeWifi(content)).toBe(payload);
  });
});

describe("WPA3 only (T:SAE)", () => {
  it("uses the WPA layout with T:SAE", () => {
    expect(encodeWifi(wifi({ encryption: "SAE" }))).toBe(
      "WIFI:T:SAE;S:Home;P:pa55word;H:false;;",
    );
  });

  it("takes short passwords and refuses ones over 63 characters", () => {
    // Android: SAE passwords are 1-63 characters (WifiConfigurationUtil).
    expect(wifiIssue(wifi({ encryption: "SAE", password: "abc" }))).toBeNull();
    expect(wifiIssue(wifi({ encryption: "SAE", password: "" }))?.field).toBe(
      "password",
    );
    expect(
      wifiIssue(wifi({ encryption: "SAE", password: "x".repeat(64) }))?.message,
    ).toMatch(/63/);
  });

  it("scans as WPA3", () => {
    const parsed = parseScan(encodeWifi(wifi({ encryption: "SAE" })));
    expect(parsed).toMatchObject({
      kind: "wifi",
      ssid: "Home",
      password: "pa55word",
      security: "WPA3",
    });
  });
});

describe("enterprise (T:WPA2-EAP)", () => {
  const enterprise = (overrides: Partial<WifiContent> = {}) =>
    wifi({
      ssid: "Campus",
      encryption: "WPA2-EAP",
      password: "s3cret;pass",
      eapMethod: "PEAP",
      phase2: "MSCHAPV2",
      identity: "ana@example.edu",
      ...overrides,
    });

  it("writes ZXing's E, PH2, A and I fields, escaped", () => {
    expect(
      encodeWifi(enterprise({ anonymousIdentity: "anonymous@example.edu" })),
    ).toBe(
      "WIFI:T:WPA2-EAP;S:Campus;E:PEAP;PH2:MSCHAPV2;A:anonymous@example.edu;I:ana@example.edu;P:s3cret\\;pass;;",
    );
  });

  it("leaves PH2 out for EAP-PWD and marks hidden networks", () => {
    expect(
      encodeWifi(enterprise({ eapMethod: "PWD", phase2: "GTC", hidden: true })),
    ).toBe(
      "WIFI:T:WPA2-EAP;S:Campus;E:PWD;I:ana@example.edu;P:s3cret\\;pass;H:true;;",
    );
  });

  it("defaults to PEAP with MSCHAPV2", () => {
    expect(
      encodeWifi(enterprise({ eapMethod: undefined, phase2: undefined })),
    ).toContain(";E:PEAP;PH2:MSCHAPV2;");
  });

  it("needs an identity and a password", () => {
    expect(encodeWifi(enterprise({ identity: " " }))).toBe("");
    expect(wifiIssue(enterprise({ identity: "" }))?.field).toBe("identity");
    expect(wifiIssue(enterprise({ password: "" }))?.field).toBe("password");
    expect(validateContent(enterprise())).toEqual({ valid: true });
    expect(
      wifiIssue({ ...enterprise(), eapMethod: "TLS" as never })?.field,
    ).toBe("eapMethod");
  });

  it("scans back into its sign-in details", () => {
    const parsed = parseScan(
      encodeWifi(enterprise({ anonymousIdentity: "anon@example.edu" })),
    );
    expect(parsed).toEqual({
      kind: "wifi",
      ssid: "Campus",
      password: "s3cret;pass",
      security: "WPA2/WPA3-Enterprise",
      hidden: false,
      enterprise: {
        method: "PEAP",
        phase2: "MSCHAPV2",
        identity: "ana@example.edu",
        anonymousIdentity: "anon@example.edu",
      },
    });
  });

  it("reads an older code's phase 2 from H:", () => {
    const parsed = parseScan("WIFI:T:WPA2-EAP;S:Lab;E:TTLS;H:PAP;I:bo;P:pw;;");
    expect(parsed).toMatchObject({
      hidden: false,
      enterprise: { method: "TTLS", phase2: "PAP", identity: "bo" },
    });
  });
});

describe("form, AI chat and MCP", () => {
  it("the form schema reports the field", () => {
    const parsed = wifiSchema.safeParse({
      ssid: "Campus",
      password: "pw",
      encryption: "WPA2-EAP",
      eapMethod: "TTLS",
      identity: "",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["identity"]);
  });

  it("design_qr encodes an enterprise network like the editor", () => {
    const result = validateDesignContent({
      type: "wifi",
      ssid: "Campus",
      password: "pw",
      encryption: "WPA2-EAP",
      eapMethod: "TTLS",
      phase2: "PAP",
      identity: "bo",
    });
    expect(result.ok && result.value).toBe(
      "WIFI:T:WPA2-EAP;S:Campus;E:TTLS;PH2:PAP;I:bo;P:pw;;",
    );
  });

  it("qr_payload_wifi builds WPA3 and enterprise networks", () => {
    const build = (input: unknown) =>
      buildWifiPayload(wifiPayloadSchema.parse(input));
    expect(build({ ssid: "Home", password: "abc", security: "SAE" })).toBe(
      "WIFI:T:SAE;S:Home;P:abc;;",
    );
    expect(
      build({
        ssid: "Campus",
        password: "pw",
        security: "WPA2-EAP",
        identity: "bo",
      }),
    ).toBe("WIFI:T:WPA2-EAP;S:Campus;E:PEAP;PH2:MSCHAPV2;I:bo;P:pw;;");
    const missing = wifiPayloadSchema.safeParse({
      ssid: "Campus",
      password: "pw",
      security: "WPA2-EAP",
    });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0]?.path).toEqual(["identity"]);
  });
});
