// The QRdx licence key (packages/auth/ee/license.ts): a key QRdx signs with
// Ed25519, with an expiry and 14 days' grace, checked offline. Anything else
// is no key at all. Tests use this run's throwaway key pair
// (../support/ee-license.ts); QRdx's private key never appears here.
import { execFileSync, spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertLicensePublicKey,
  QRDX_LICENSE_PUBLIC_KEY,
} from "@repo/auth/ee/license-public-key";
import {
  checkLicenseKey,
  describeEeLicenseForLog,
  eeFeatureLicensed,
  eeLicenseChangesAt,
  eeLicensedFeatures,
  eeLicenseState,
  trustLicensePublicKeyForTests,
} from "@repo/auth/license";
import { afterEach, describe, expect, it, vi } from "vitest";
import { licenceProbe } from "@/app/(app)/admin/_lib/licence";
import {
  publicKeyText,
  signLicence,
  testLicence,
  testLicencePublicKey,
} from "../support/ee-license";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2027-03-01T12:00:00.000Z");
const at = (days: number) => new Date(NOW.getTime() + days * DAY_MS);

/** A licence issued a year before NOW, expiring `days` after it. */
function licence(days: number, overrides: Record<string, unknown> = {}) {
  return signLicence({
    id: "lic_acme",
    customer: "Acme Ltd",
    issuedAt: at(-365).toISOString(),
    expiresAt: at(days).toISOString(),
    ...overrides,
  });
}

const env = (key: string | undefined) => ({ QRDX_EE_LICENSE: key });
const stateOf = (key: string | undefined, now = NOW) =>
  eeLicenseState(env(key), now);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
  // Back to this run's key, whatever a test did.
  trustLicensePublicKeyForTests(testLicencePublicKey());
});

describe("a key QRdx signed", () => {
  it("is read: id, customer, dates, every feature, no seat count", () => {
    const state = stateOf(licence(90));
    expect(state).toMatchObject({
      status: "active",
      licence: {
        id: "lic_acme",
        customer: "Acme Ltd",
        features: ["sso", "auditLog"],
        seats: null,
      },
    });
    if (state.status !== "active") throw new Error("not active");
    expect(state.licence.expiresAt.toISOString()).toBe(at(90).toISOString());
    expect(state.offAt.toISOString()).toBe(at(104).toISOString());
    expect(eeLicensedFeatures(state)).toEqual(["sso", "auditLog"]);
  });

  it("turns on only the features it lists, and skips names it doesn't know", () => {
    const state = stateOf(licence(90, { features: ["sso", "kiosk"] }));
    expect(eeLicensedFeatures(state)).toEqual(["sso"]);
    expect(
      eeFeatureLicensed("sso", env(licence(90, { features: ["sso"] })), NOW),
    ).toBe(true);
    expect(
      eeFeatureLicensed(
        "auditLog",
        env(licence(90, { features: ["sso"] })),
        NOW,
      ),
    ).toBe(false);
  });

  it("keeps a seat count as information only", () => {
    const state = stateOf(licence(90, { seats: 50 }));
    expect(state).toMatchObject({ licence: { seats: 50 } });
    expect(eeLicensedFeatures(state)).toEqual(["sso", "auditLog"]);
  });
});

describe("expiry", () => {
  const key = licence(0);

  it("keeps the features on for 14 days' grace, then turns them off", () => {
    expect(stateOf(key, at(0)).status).toBe("active");
    expect(stateOf(key, at(1)).status).toBe("grace");
    expect(eeLicensedFeatures(stateOf(key, at(1)))).toEqual([
      "sso",
      "auditLog",
    ]);
    expect(stateOf(key, at(14)).status).toBe("grace");
    expect(stateOf(key, at(14.01)).status).toBe("expired");
    expect(eeLicensedFeatures(stateOf(key, at(15)))).toEqual([]);
    expect(eeFeatureLicensed("sso", env(key), at(15))).toBe(false);
  });

  it("says when the state changes next: after the expiry, then after the grace", () => {
    expect(eeLicenseChangesAt(stateOf(key, at(-1)))).toBe(at(0).getTime() + 1);
    expect(eeLicenseChangesAt(stateOf(key, at(1)))).toBe(at(14).getTime() + 1);
    expect(eeLicenseChangesAt(stateOf(key, at(20)))).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});

describe("anything else counts as no key", () => {
  const valid = licence(90);
  const [prefix, payload, signature] = valid.split(".");
  const other = generateKeyPairSync("ed25519").privateKey;
  const reSigned = (data: unknown) =>
    signLicence(data as Record<string, unknown>);

  it.each([
    ["any old value", "local-dev", "malformed"],
    [
      "the right shape with the wrong prefix",
      `qrdx-ee-2.${payload}.${signature}`,
      "malformed",
    ],
    [
      "a cut-off signature",
      `${prefix}.${payload}.${signature?.slice(0, 40)}`,
      "malformed",
    ],
    [
      "a payload changed after signing",
      `${prefix}.${Buffer.from(
        JSON.stringify({
          id: "lic_acme",
          customer: "Acme Ltd",
          issuedAt: at(-365).toISOString(),
          expiresAt: at(3650).toISOString(),
        }),
      ).toString("base64url")}.${signature}`,
      "signature",
    ],
    [
      "a key signed by someone else",
      signLicence(
        {
          id: "lic_forged",
          customer: "Someone",
          issuedAt: at(-1).toISOString(),
          expiresAt: at(3650).toISOString(),
        },
        other,
      ),
      "signature",
    ],
    [
      "a signed payload that isn't a licence",
      reSigned({ id: "lic_x" }),
      "malformed",
    ],
    [
      "a licence that expires before it was issued",
      reSigned({
        id: "lic_x",
        customer: "X",
        issuedAt: at(1).toISOString(),
        expiresAt: at(-1).toISOString(),
      }),
      "malformed",
    ],
    [
      "a seat count that isn't a whole number",
      reSigned({
        id: "lic_x",
        customer: "X",
        issuedAt: at(-1).toISOString(),
        expiresAt: at(30).toISOString(),
        seats: 2.5,
      }),
      "malformed",
    ],
  ])("%s", (_, key, problem) => {
    const state = stateOf(key);
    expect(state).toEqual({ status: "invalid", problem });
    expect(eeLicensedFeatures(state)).toEqual([]);
    expect(eeFeatureLicensed("sso", env(key), NOW)).toBe(false);
  });

  it("no key, or a blank one, is missing", () => {
    expect(stateOf(undefined)).toEqual({ status: "missing" });
    expect(stateOf("   ")).toEqual({ status: "missing" });
  });
});

describe("which public keys are trusted", () => {
  it("holds QRdx's public key, and a production build stops without one", () => {
    // An Ed25519 public key: 32 bytes in base64url.
    expect(QRDX_LICENSE_PUBLIC_KEY).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(QRDX_LICENSE_PUBLIC_KEY, "base64url").byteLength).toBe(
      32,
    );
    expect(() => assertLicensePublicKey(QRDX_LICENSE_PUBLIC_KEY)).not.toThrow();
    expect(() => assertLicensePublicKey("")).toThrow(
      /QRDX_LICENSE_PUBLIC_KEY is empty/,
    );
    const nextConfig = readFileSync(
      path.resolve(import.meta.dirname, "../../next.config.ts"),
      "utf8",
    );
    expect(nextConfig).toMatch(
      /if \(\s*process\.env\.NODE_ENV === "production" &&\s*!process\.argv\.includes\("typegen"\)\s*\) \{\s*assertLicensePublicKey\(QRDX_LICENSE_PUBLIC_KEY\);/,
    );
  });

  it("without any trusted key, every key is turned down", () => {
    expect(checkLicenseKey(licence(90), [])).toEqual({
      ok: false,
      problem: "no-public-key",
    });
  });

  it("trusts QRdx's key: a key this run signed passes only through the test seam", () => {
    trustLicensePublicKeyForTests(null);
    expect(stateOf(licence(90))).toEqual({
      status: "invalid",
      problem: "signature",
    });
  });

  it("a production server trusts no test key and lets no variable add one", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => trustLicensePublicKeyForTests(testLicencePublicKey())).toThrow(
      /tests and development only/,
    );
    // A self-hoster's own key pair, offered every way configuration could.
    const own = generateKeyPairSync("ed25519");
    const ownPublic = publicKeyText(own.publicKey);
    for (const name of [
      "QRDX_LICENSE_PUBLIC_KEY",
      "QRDX_EE_LICENSE_PUBLIC_KEY",
      "QRDX_EE_PUBLIC_KEY",
    ]) {
      vi.stubEnv(name, ownPublic);
    }
    const ownKey = signLicence(
      {
        id: "lic_own",
        customer: "Self-signed",
        issuedAt: at(-1).toISOString(),
        expiresAt: at(3650).toISOString(),
      },
      own.privateKey,
    );
    // Only QRdx's key counts.
    expect(
      eeLicenseState({ ...process.env, QRDX_EE_LICENSE: ownKey }, NOW),
    ).toEqual({
      status: "invalid",
      problem: "signature",
    });
    // Nor the test key trusted before NODE_ENV said production.
    expect(stateOf(licence(90))).toEqual({
      status: "invalid",
      problem: "signature",
    });
  });

  it("checks a key once per process, and again only for other trusted keys", () => {
    const key = licence(90);
    expect(checkLicenseKey(key, [testLicencePublicKey()]).ok).toBe(true);
    expect(checkLicenseKey(key, []).ok).toBe(false);
    expect(stateOf(key).status).toBe("active");
    trustLicensePublicKeyForTests(null);
    expect(stateOf(key)).toMatchObject({ status: "invalid" });
  });
});

describe("the log", () => {
  it("says once what the key does, and never prints the key", () => {
    vi.stubEnv("NODE_ENV", "development");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const key = licence(90, { id: "lic_log_once" });
    eeLicenseState(env(key), NOW);
    eeLicenseState(env(key), NOW);
    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toMatchObject({
      event: "auth.ee_license",
      status: "active",
      licence: "lic_log_once",
      customer: "Acme Ltd",
      expiresAt: "2027-05-30",
    });
    expect(line).not.toContain(key.split(".")[2] ?? "-");
    expect(line).not.toContain(key.split(".")[1] ?? "-");

    eeLicenseState(env("not-a-key-but-secret"), NOW);
    const refused = String(error.mock.calls.at(-1)?.[0]);
    expect(JSON.parse(refused)).toMatchObject({
      status: "invalid",
      problem: "malformed",
    });
    expect(refused).not.toContain("not-a-key-but-secret");
  });

  it("words each state plainly", () => {
    const key = licence(0, { id: "lic_words" });
    expect(describeEeLicenseForLog(stateOf(key, at(2))).message).toBe(
      "QRdx licence lic_words expired on 2027-03-01: sso and auditLog stay on until 2027-03-15.",
    );
    expect(describeEeLicenseForLog({ status: "missing" }).message).toMatch(
      /isn't set: single sign-on and the audit log are off/,
    );
  });
});

describe("what /admin/health says", () => {
  const key = licence(0);

  it("the expiry date while it's valid, with a warning in the last 30 days", () => {
    expect(licenceProbe(stateOf(licence(90)), NOW)).toEqual({
      status: "ok",
      detail: "Licence for Acme Ltd expires on 2027-05-30",
    });
    expect(licenceProbe(stateOf(key, at(-10)), at(-10))).toEqual({
      status: "warn",
      detail: "Licence for Acme Ltd expires on 2027-03-01",
    });
    expect(
      licenceProbe(stateOf(licence(90, { features: ["sso"] })), NOW).detail,
    ).toBe("Licence for Acme Ltd expires on 2027-05-30 (single sign-on only)");
  });

  it("when the features switch off during the grace period, and after", () => {
    expect(licenceProbe(stateOf(key, at(3)), at(3))).toEqual({
      status: "warn",
      detail:
        "Licence expired on 2027-03-01: single sign-on and the audit log switch off on 2027-03-15",
    });
    expect(licenceProbe(stateOf(key, at(20)), at(20))).toEqual({
      status: "error",
      detail:
        "Licence expired on 2027-03-01: single sign-on and the audit log are off since 2027-03-15",
    });
  });

  it("a key that isn't valid, and no key", () => {
    expect(licenceProbe(stateOf("local-dev"))).toEqual({
      status: "error",
      detail:
        "Licence key is not valid: single sign-on and the audit log are off",
    });
    expect(licenceProbe(stateOf(undefined))).toEqual({
      status: "off",
      detail:
        "QRDX_EE_LICENSE not set: single sign-on and the audit log are off",
    });
    expect(
      licenceProbe({ status: "invalid", problem: "no-public-key" }).detail,
    ).toBe(
      "This build has no licence public key: single sign-on and the audit log are off",
    );
  });
});

describe("a licence that runs out while the server is up", () => {
  it("turns SSO and the audit log off in the app and in sign-in, without a restart", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.resetModules();
    vi.stubEnv("QRDX_EE_LICENSE", licence(0));
    const app = await import("@/lib/feature-availability");
    const sso = await import("@repo/auth/sso");
    const required = await import("@repo/auth/sso-required");
    expect(app.isFeatureAvailable("sso")).toBe(true);
    expect(app.isFeatureAvailable("auditLog")).toBe(true);

    vi.setSystemTime(at(10));
    expect(app.isFeatureAvailable("sso")).toBe(true);

    vi.setSystemTime(at(15));
    expect(app.isFeatureAvailable("sso")).toBe(false);
    expect(app.isFeatureAvailable("auditLog")).toBe(false);
    expect(app.isPathAvailable("/dashboard/acme/settings/sso")).toBe(false);
    // Sign-in stops offering and accepting SSO, and stops requiring it, so
    // people use their other ways in (an email code, Google or GitHub).
    expect(await sso.ssoSignInOffered("acme.com")).toBe(false);
    expect(
      await sso.ssoProviderUsable({
        organizationId: "org_acme",
        domainVerified: true,
      }),
    ).toBe(false);
    expect(await required.findSsoRequirement("ada@acme.com")).toBeNull();
  });
});

describe("the issuing script", () => {
  const script = path.resolve(
    import.meta.dirname,
    "../../../../packages/auth/ee/scripts/license.mjs",
  );
  const run = (args: string[]) =>
    spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

  it("makes a key pair (private key 0600) and signs keys the check accepts", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "qrdx-license-"));
    try {
      const file = path.join(dir, "private.pem");
      const publicKey = execFileSync(
        process.execPath,
        [script, "keygen", "--out", file],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim();
      expect(publicKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(statSync(file).mode & 0o777).toBe(0o600);
      // Never over an existing file.
      expect(run(["keygen", "--out", file]).status).toBe(1);

      const issued = run([
        "issue",
        "--private-key",
        file,
        "--customer",
        "Acme Ltd",
        "--expires",
        "2099-12-31",
        "--features",
        "sso",
        "--seats",
        "25",
        "--id",
        "lic_acme_2099",
      ]);
      expect(issued.status).toBe(0);
      const key = issued.stdout.trim();
      // stdout is the key alone; the private key never appears anywhere.
      expect(key).toMatch(/^qrdx-ee-1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{86}$/);
      expect(issued.stderr).not.toContain("PRIVATE KEY");
      const verdict = checkLicenseKey(key, [publicKey]);
      expect(verdict).toMatchObject({
        ok: true,
        licence: {
          id: "lic_acme_2099",
          customer: "Acme Ltd",
          features: ["sso"],
          seats: 25,
        },
      });
      if (!verdict.ok) throw new Error("not ok");
      expect(verdict.licence.expiresAt.toISOString()).toBe(
        "2099-12-31T23:59:59.999Z",
      );
      // And only by that key.
      expect(checkLicenseKey(key, [testLicencePublicKey()])).toEqual({
        ok: false,
        problem: "signature",
      });

      for (const bad of [
        ["--expires", "2020-01-01"],
        ["--expires", "next year"],
        ["--expires", "2099-12-31", "--features", "sso,kiosk"],
        ["--expires", "2099-12-31", "--seats", "0"],
      ]) {
        const refused = run([
          "issue",
          "--private-key",
          file,
          "--customer",
          "Acme Ltd",
          ...bad,
        ]);
        expect(refused.status, bad.join(" ")).toBe(1);
        expect(refused.stdout).toBe("");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("covers every ee feature when --features is left out", () => {
    expect(eeLicensedFeatures(stateOf(testLicence()))).toEqual([
      "sso",
      "auditLog",
    ]);
  });
});
