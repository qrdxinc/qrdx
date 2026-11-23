import "server-only";

import { createHash } from "node:crypto";

// Client secrets bcrypt accepted lately, for the token endpoint
// (app/api/oauth/token): a client that refreshes many people's tokens in a
// burst (ChatGPT, from a few server addresses) runs bcrypt once, not once a
// request. Kept per app as SHA-256 of the secret (never the secret), with
// the stored hash it matched, so a rotated secret (a new hash) is checked
// again at once. In this instance's memory only, a few minutes, bounded.

/** How long a checked secret is remembered, and how many at most. */
const VERIFIED_SECRET_MS = 5 * 60_000;
const VERIFIED_SECRET_MAX = 1000;

/**
 * Secrets bcrypt accepted lately, per app: SHA-256 of the secret (never the
 * secret), with the stored hash it matched, so a rotated secret (a new
 * hash) is checked again at once. In this instance's memory only.
 */
const verifiedSecrets = new Map<string, { hash: string; until: number }>();

const secretKey = (appId: string, secret: string) =>
  `${appId}:${createHash("sha256").update(secret).digest("hex")}`;

export function rememberedSecret(
  appId: string,
  secret: string,
  storedHash: string,
): boolean {
  const key = secretKey(appId, secret);
  const entry = verifiedSecrets.get(key);
  if (!entry) return false;
  if (entry.until <= Date.now() || entry.hash !== storedHash) {
    verifiedSecrets.delete(key);
    return false;
  }
  return true;
}

export function rememberSecret(
  appId: string,
  secret: string,
  storedHash: string,
) {
  const key = secretKey(appId, secret);
  verifiedSecrets.delete(key);
  verifiedSecrets.set(key, {
    hash: storedHash,
    until: Date.now() + VERIFIED_SECRET_MS,
  });
  // Oldest first: drop the oldest once over the cap.
  while (verifiedSecrets.size > VERIFIED_SECRET_MAX) {
    const oldest = verifiedSecrets.keys().next().value;
    if (oldest === undefined) break;
    verifiedSecrets.delete(oldest);
  }
}

/** Forgets every remembered secret (tests). */
export function forgetVerifiedSecrets(): void {
  verifiedSecrets.clear();
}
