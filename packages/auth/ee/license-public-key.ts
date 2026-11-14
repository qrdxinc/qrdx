// QRdx's licence public key: an Ed25519 key, its 32 bytes in base64url. It
// is the only key a production build trusts when it checks QRDX_EE_LICENSE
// (./license.ts). The private key stays with QRdx: never in this repository,
// its tests, CI or logs.
//
// QRdx fills this in. Make the pair with
//   node packages/auth/ee/scripts/license.mjs keygen --out <private key file>
// and paste the public key it prints. While it's empty, a production build
// stops (apps/app/next.config.ts) and a production server turns every key
// down: nothing is accepted without it. Tests and development use a key they
// make themselves (trustLicensePublicKeyForTests in ./license.ts).
export const QRDX_LICENSE_PUBLIC_KEY = "";

/** Stops a production build that has no licence public key. */
export function assertLicensePublicKey(publicKey: string): void {
  if (!publicKey) {
    throw new Error(
      "QRDX_LICENSE_PUBLIC_KEY is empty (packages/auth/ee/license-public-key.ts). A production build needs QRdx's licence public key, or every QRDX_EE_LICENSE key is turned down."
    );
  }
}
