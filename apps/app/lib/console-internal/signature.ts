import { createHmac, timingSafeEqual } from "node:crypto";

// How the back-office console signs its calls to /api/internal/console/*:
// an HMAC-SHA256 with CONSOLE_INTERNAL_SECRET over the timestamp, a random
// request id, the path and the raw body. Server to server only; no user
// credential is involved. Pure, so tests cover it directly.

export const TIMESTAMP_HEADER = "x-qrdx-console-timestamp";
export const REQUEST_ID_HEADER = "x-qrdx-console-request";
export const SIGNATURE_HEADER = "x-qrdx-console-signature";

/** A signature older or newer than this many seconds is refused. */
export const MAX_SKEW_SECONDS = 300;
/** Shorter secrets leave the endpoints off. */
export const MIN_SECRET_LENGTH = 32;
/** Request bodies are small JSON objects. */
export const MAX_BODY_BYTES = 64 * 1024;

const TIMESTAMP = /^\d{1,12}$/;
const REQUEST_ID = /^[0-9a-f]{32}$/;
const SIGNATURE = /^v1=([0-9a-f]{64})$/;

/** The secret is set and long enough for the endpoints to answer. */
export const isUsableSecret = (secret: string | undefined): secret is string =>
  typeof secret === "string" && secret.length >= MIN_SECRET_LENGTH;

export interface SignedParts {
  /** Unix seconds, as sent */
  timestamp: string;
  requestId: string;
  /** The exact path, e.g. /api/internal/console/users/ban */
  pathname: string;
  /** The raw request body */
  body: string;
}

const digest = (secret: string, parts: SignedParts) =>
  createHmac("sha256", secret)
    .update(
      `${parts.timestamp}.${parts.requestId}.${parts.pathname}.${parts.body}`,
    )
    .digest("hex");

/** The signature header's value for these parts. */
export function consoleSignature(secret: string, parts: SignedParts): string {
  return `v1=${digest(secret, parts)}`;
}

export type SignatureCheck =
  | { ok: true; requestId: string }
  | { ok: false; reason: "malformed" | "stale" | "mismatch" };

/**
 * Checks the three headers against the path and body: well-formed, within
 * MAX_SKEW_SECONDS of `now`, and signed with `secret` (compared in constant
 * time).
 */
export function verifyConsoleSignature({
  secret,
  timestamp,
  requestId,
  signature,
  pathname,
  body,
  now = Date.now(),
}: {
  secret: string;
  timestamp: string | null;
  requestId: string | null;
  signature: string | null;
  pathname: string;
  body: string;
  now?: number;
}): SignatureCheck {
  const sent = signature ? SIGNATURE.exec(signature)?.[1] : undefined;
  if (
    !(
      timestamp &&
      TIMESTAMP.test(timestamp) &&
      requestId &&
      REQUEST_ID.test(requestId) &&
      sent
    )
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (Math.abs(now / 1000 - Number(timestamp)) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "stale" };
  }
  const expected = Buffer.from(
    digest(secret, { timestamp, requestId, pathname, body }),
    "hex",
  );
  const given = Buffer.from(sent, "hex");
  if (!(given.length === expected.length && timingSafeEqual(given, expected))) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true, requestId };
}
