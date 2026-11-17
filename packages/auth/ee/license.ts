import "server-only";
import { createPublicKey, type KeyObject, verify } from "node:crypto";
import {
  EE_FEATURES,
  EE_LICENSE_ENV,
  EE_LICENSE_GRACE_DAYS,
  type EeFeature,
} from "../ee-license";
import { QRDX_LICENSE_PUBLIC_KEY } from "./license-public-key";

// The QRdx licence key (QRDX_EE_LICENSE), checked offline. QRdx issues it with
// an enterprise agreement (./scripts/license.mjs):
//
//   qrdx-ee-1.<payload>.<signature>
//
// The payload is base64url JSON: the licence id, the customer, when it was
// issued and when it expires, and optionally the features it covers (none
// listed: all of them) and a seat count, kept as information only. The
// signature is Ed25519 over "qrdx-ee-1.<payload>", by QRdx's private key;
// ./license-public-key.ts holds the public half.
//
// A key that is missing, malformed, signed by another key or past its expiry
// and grace period turns the ee features off, exactly like no key. Codes,
// pages and every other way to sign in keep working: only the ee features
// stop. The check of each key is cached for the process; its
// expiry is compared with the clock on every read, so a licence that runs out
// while the server is up turns its features off without a restart.

export const LICENSE_KEY_PREFIX = "qrdx-ee-1";

// The prefix, a payload of at most 4096 characters and the 64-byte signature.
const KEY_PATTERN = /^qrdx-ee-1\.([A-Za-z0-9_-]{1,4096})\.([A-Za-z0-9_-]{86})$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_MS = EE_LICENSE_GRACE_DAYS * DAY_MS;

export interface EeLicence {
  id: string;
  customer: string;
  issuedAt: Date;
  expiresAt: Date;
  /** The features it turns on: every ee feature when the key lists none. */
  features: readonly EeFeature[];
  /** Seats bought, for information only: nothing counts or enforces them. */
  seats: number | null;
}

/** Why a key was turned down. */
export type EeLicenseProblem =
  /** Not a QRdx licence key, or its payload can't be read */
  | "malformed"
  /** Not signed by QRdx */
  | "signature"
  /** This build has no public key to check it with */
  | "no-public-key";

export type EeLicenseState =
  | { status: "missing" }
  | { status: "invalid"; problem: EeLicenseProblem }
  | {
      /**
       * active: before its expiry; grace: expired, features still on until
       * `offAt`; expired: past `offAt`, features off.
       */
      status: "active" | "grace" | "expired";
      licence: EeLicence;
      offAt: Date;
    };

type Verdict =
  | { ok: true; licence: EeLicence }
  | { ok: false; problem: EeLicenseProblem };

// ─── Trusted keys ─────────────────────────────────────────────────────────────
//
// A production build trusts QRdx's key and nothing else: no variable, file or
// setting adds one. Tests and development can add a key they made themselves,
// only from code, through trustLicensePublicKeyForTests. Next replaces
// process.env.NODE_ENV with "production" when it builds, so in a production
// build that function throws and the branch that reads its key is dead code.

const TEST_KEY = Symbol.for("@repo/auth/ee-license-test-public-key");
type Slot = Record<symbol, string | undefined>;

/**
 * Tests and development only: also trust `publicKey` (an Ed25519 public key,
 * base64url), made with ./scripts/license.mjs keygen or node:crypto. Null
 * stops trusting it. Throws in production.
 */
export function trustLicensePublicKeyForTests(publicKey: string | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "trustLicensePublicKeyForTests is for tests and development only."
    );
  }
  (globalThis as unknown as Slot)[TEST_KEY] = publicKey ?? undefined;
}

function trustedPublicKeys(): string[] {
  const keys: string[] = [];
  if (QRDX_LICENSE_PUBLIC_KEY) keys.push(QRDX_LICENSE_PUBLIC_KEY);
  if (process.env.NODE_ENV !== "production") {
    const testKey = (globalThis as unknown as Slot)[TEST_KEY];
    if (testKey) keys.push(testKey);
  }
  return keys;
}

const keyObjects = new Map<string, KeyObject | null>();

function publicKeyObject(publicKey: string): KeyObject | null {
  if (!keyObjects.has(publicKey)) {
    try {
      keyObjects.set(
        publicKey,
        createPublicKey({
          key: { kty: "OKP", crv: "Ed25519", x: publicKey },
          format: "jwk",
        })
      );
    } catch {
      keyObjects.set(publicKey, null);
    }
  }
  return keyObjects.get(publicKey) ?? null;
}

// ─── Reading a key ────────────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() && value.length <= max
    ? value
    : null;
}

function instant(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readPayload(payload: string): EeLicence | null {
  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  const id = text(data.id, 100);
  const customer = text(data.customer, 200);
  const issuedAt = instant(data.issuedAt);
  const expiresAt = instant(data.expiresAt);
  if (!(id && customer && issuedAt && expiresAt)) return null;
  if (expiresAt.getTime() <= issuedAt.getTime()) return null;

  let features: EeFeature[] = [...EE_FEATURES];
  if (data.features !== undefined) {
    const listed = data.features;
    if (
      !(Array.isArray(listed) && listed.every((f) => typeof f === "string"))
    ) {
      return null;
    }
    // A feature this version doesn't know (a later one) is skipped.
    features = EE_FEATURES.filter((feature) => listed.includes(feature));
  }
  const { seats } = data;
  if (
    seats !== undefined &&
    !(typeof seats === "number" && Number.isInteger(seats) && seats > 0)
  ) {
    return null;
  }
  return {
    id,
    customer,
    issuedAt,
    expiresAt,
    features,
    seats: seats ?? null,
  };
}

/** Checks a key's form and signature against `publicKeys`. Pure. */
export function checkLicenseKey(
  key: string,
  publicKeys: readonly string[]
): Verdict {
  const match = KEY_PATTERN.exec(key);
  if (!match) return { ok: false, problem: "malformed" };
  if (publicKeys.length === 0) return { ok: false, problem: "no-public-key" };
  const [, payload = "", signature = ""] = match;
  const signed = Buffer.from(`${LICENSE_KEY_PREFIX}.${payload}`);
  const signatureBytes = Buffer.from(signature, "base64url");
  const signedByTrustedKey = publicKeys.some((publicKey) => {
    const object = publicKeyObject(publicKey);
    return object !== null && verify(null, signed, object, signatureBytes);
  });
  if (!signedByTrustedKey) return { ok: false, problem: "signature" };
  const licence = readPayload(payload);
  return licence ? { ok: true, licence } : { ok: false, problem: "malformed" };
}

// One check per key (and set of trusted keys) for the life of the process.
const verdicts = new Map<string, Verdict>();

function cachedCheck(key: string): Verdict {
  const publicKeys = trustedPublicKeys();
  const cacheKey = `${publicKeys.join(",")}\n${key}`;
  let verdict = verdicts.get(cacheKey);
  if (!verdict) {
    if (verdicts.size >= 16) verdicts.clear();
    verdict = checkLicenseKey(key, publicKeys);
    verdicts.set(cacheKey, verdict);
  }
  return verdict;
}

// ─── The state now ────────────────────────────────────────────────────────────

/** The licence key's state at `now` (QRDX_EE_LICENSE in `env`). */
export function eeLicenseState(
  env: Readonly<Record<string, string | undefined>> = process.env,
  now: Date = new Date()
): EeLicenseState {
  const state = stateAt(env[EE_LICENSE_ENV]?.trim(), now);
  logOnce(state);
  return state;
}

function stateAt(key: string | undefined, now: Date): EeLicenseState {
  if (!key) return { status: "missing" };
  const verdict = cachedCheck(key);
  if (!verdict.ok) return { status: "invalid", problem: verdict.problem };
  const { licence } = verdict;
  const offAt = new Date(licence.expiresAt.getTime() + GRACE_MS);
  const time = now.getTime();
  let status: "active" | "grace" | "expired" = "expired";
  if (time <= licence.expiresAt.getTime()) status = "active";
  else if (time <= offAt.getTime()) status = "grace";
  return { status, licence, offAt };
}

/** The ee features the licence turns on in `state`: none unless it's valid. */
export function eeLicensedFeatures(
  state: EeLicenseState
): readonly EeFeature[] {
  return state.status === "active" || state.status === "grace"
    ? state.licence.features
    : [];
}

/** Whether a valid licence turns `feature` on right now. */
export function eeFeatureLicensed(
  feature: EeFeature,
  env: Readonly<Record<string, string | undefined>> = process.env,
  now: Date = new Date()
): boolean {
  return eeLicensedFeatures(eeLicenseState(env, now)).includes(feature);
}

/**
 * When `state` next changes on its own (milliseconds since the epoch): just
 * after the expiry, then just after the grace period. Never, otherwise.
 */
export function eeLicenseChangesAt(state: EeLicenseState): number {
  if (state.status === "active") return state.licence.expiresAt.getTime() + 1;
  if (state.status === "grace") return state.offAt.getTime() + 1;
  return Number.POSITIVE_INFINITY;
}

// ─── The log ──────────────────────────────────────────────────────────────────

const day = (date: Date) => date.toISOString().slice(0, 10);

/** One line about the state, for the server's log. Never the key itself. */
export function describeEeLicenseForLog(
  state: EeLicenseState
): Record<string, unknown> {
  if (state.status === "missing") {
    return {
      status: "missing",
      message: `${EE_LICENSE_ENV} isn't set: the ee features are off.`,
    };
  }
  if (state.status === "invalid") {
    return {
      status: "invalid",
      problem: state.problem,
      message:
        state.problem === "no-public-key"
          ? "This build has no licence public key: every licence key is turned down, and the ee features are off."
          : `${EE_LICENSE_ENV} isn't a valid QRdx licence key: the ee features are off.`,
    };
  }
  const { licence, offAt } = state;
  const fields = {
    status: state.status,
    licence: licence.id,
    customer: licence.customer,
    expiresAt: day(licence.expiresAt),
    offAt: day(offAt),
    features: licence.features,
  };
  const on = licence.features.join(", ") || "no features";
  const message = {
    active: `QRdx licence ${licence.id} is valid until ${day(licence.expiresAt)}: ${on} on.`,
    grace: `QRdx licence ${licence.id} expired on ${day(licence.expiresAt)}: ${on} stay on until ${day(offAt)}.`,
    expired: `QRdx licence ${licence.id} expired on ${day(licence.expiresAt)}: the ee features are off since ${day(offAt)}.`,
  }[state.status];
  return { ...fields, message };
}

// Kept on globalThis: Next bundles instrumentation.ts apart from the pages and
// routes, so each gets its own copy of this module, and a Set in the module
// would log the same state once per copy.
const LOGGED = Symbol.for("@repo/auth/ee-license-logged");
const logSlot = globalThis as unknown as Record<
  symbol,
  Set<string> | undefined
>;
logSlot[LOGGED] ??= new Set<string>();
const logged = logSlot[LOGGED];

// Once per state per process: at start-up (apps/app/instrumentation.ts), and
// again when the licence enters its grace period or runs out. Not while
// `next build` runs: each of its workers is a process, and the build serves
// no one.
function logOnce(state: EeLicenseState) {
  if (process.env.NODE_ENV === "test") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const id =
    state.status === "missing"
      ? "missing"
      : state.status === "invalid"
        ? `invalid:${state.problem}`
        : `${state.status}:${state.licence.id}`;
  if (logged.has(id)) return;
  logged.add(id);
  const level =
    state.status === "active" || state.status === "missing"
      ? "info"
      : state.status === "grace"
        ? "warn"
        : "error";
  console[level](
    JSON.stringify({
      event: "auth.ee_license",
      ...describeEeLicenseForLog(state),
    })
  );
}
