// Licence keys for tests (packages/auth/ee/license.ts). Each test run makes
// its own throwaway Ed25519 key pair; its public key is trusted through
// trustLicensePublicKeyForTests, which only works outside production. QRdx's
// real private key is never needed here.
import {
  generateKeyPairSync,
  type KeyObject,
  sign as signBytes,
} from "node:crypto";
import { LICENSE_KEY_PREFIX } from "@repo/auth/license";

type KeyPair = { privateKey: KeyObject; publicKey: KeyObject };

// Kept on globalThis so vi.resetModules() doesn't make a second pair.
const PAIR = Symbol.for("qrdx-tests/ee-license-key-pair");
type Slot = Record<symbol, KeyPair | undefined>;

export function testKeyPair(): KeyPair {
  const slot = globalThis as unknown as Slot;
  slot[PAIR] ??= generateKeyPairSync("ed25519");
  return slot[PAIR];
}

/** A public key as license-public-key.ts holds one (base64url). */
export function publicKeyText(publicKey: KeyObject): string {
  return publicKey.export({ format: "jwk" }).x as string;
}

export const testLicencePublicKey = () =>
  publicKeyText(testKeyPair().publicKey);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Signs `payload` as a licence key, with the test pair unless told otherwise. */
export function signLicence(
  payload: Record<string, unknown>,
  privateKey: KeyObject = testKeyPair().privateKey,
): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signed = `${LICENSE_KEY_PREFIX}.${encoded}`;
  const signature = signBytes(null, Buffer.from(signed), privateKey);
  return `${signed}.${signature.toString("base64url")}`;
}

/** A licence for every ee feature, valid for `days` from now (negative: expired). */
export function testLicence(
  overrides: Record<string, unknown> = {},
  { days = 20 * 365 } = {},
): string {
  const now = Date.now();
  return signLicence({
    id: "lic_test",
    customer: "QRdx tests",
    issuedAt: new Date(now - 400 * DAY_MS).toISOString(),
    expiresAt: new Date(now + days * DAY_MS).toISOString(),
    ...overrides,
  });
}
