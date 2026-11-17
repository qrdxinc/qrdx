#!/usr/bin/env node
// Makes QRdx licence keys for QRDX_EE_LICENSE (the format is in ../license.ts).
// Node's built-in crypto only; nothing goes over the network.
//
//   node packages/auth/ee/scripts/license.mjs keygen --out <private key file>
//     Makes an Ed25519 key pair. The private key is written to the file
//     (mode 0600, never over an existing file); the public key is printed,
//     for QRDX_LICENSE_PUBLIC_KEY in ../license-public-key.ts.
//
//   node packages/auth/ee/scripts/license.mjs issue --private-key <file> \
//     --customer "Acme Ltd" --expires 2027-11-30 \
//     [--features sso,auditLog,clientPortal,whiteLabel,conversions] \
//     [--seats 50] [--id lic_acme_2026]
//     Prints a licence key valid through the end of --expires (UTC). Without
//     --features it covers every ee feature. --seats is recorded only.
//
// Keep the private key out of this repository, CI and logs.

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
} from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../..");

const PREFIX = "qrdx-ee-1";
// The names in ../../ee-license.ts EE_FEATURES.
const FEATURES = [
  "sso",
  "auditLog",
  "clientPortal",
  "whiteLabel",
  "conversions",
];

function fail(message) {
  console.error(`license: ${message}`);
  process.exit(1);
}

/** The public key production builds trust, or null when it can't be read. */
function trustedPublicKey() {
  try {
    const source = readFileSync(
      resolve(HERE, "../license-public-key.ts"),
      "utf8"
    );
    return (
      /QRDX_LICENSE_PUBLIC_KEY\s*=\s*"([A-Za-z0-9_-]+)"/.exec(source)?.[1] ??
      null
    );
  } catch {
    return null;
  }
}

function keygen(args) {
  const { values } = parseArgs({ args, options: { out: { type: "string" } } });
  if (!values.out) fail("keygen needs --out <private key file>");
  const inRepo = relative(REPO_ROOT, resolve(values.out));
  if (!(inRepo.startsWith("..") || resolve(inRepo) === inRepo)) {
    fail(
      `${values.out} is inside this repository; write the private key somewhere outside it`
    );
  }
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  try {
    writeFileSync(
      values.out,
      privateKey.export({ type: "pkcs8", format: "pem" }),
      { mode: 0o600, flag: "wx" }
    );
  } catch (error) {
    fail(
      error?.code === "EEXIST"
        ? `${values.out} already exists; pick another path`
        : `couldn't write ${values.out}: ${error?.message ?? error}`
    );
  }
  console.error(
    `Private key written to ${values.out} (mode 0600). Keep it out of the repository.`
  );
  console.error("Public key (QRDX_LICENSE_PUBLIC_KEY):");
  console.log(publicKey.export({ format: "jwk" }).x);
}

function issue(args) {
  const { values } = parseArgs({
    args,
    options: {
      "private-key": { type: "string" },
      customer: { type: "string" },
      expires: { type: "string" },
      features: { type: "string" },
      seats: { type: "string" },
      id: { type: "string" },
    },
  });
  if (!values["private-key"]) fail("issue needs --private-key <file>");
  const customer = values.customer?.trim();
  if (!customer || customer.length > 200) {
    fail("issue needs --customer, at most 200 characters");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.expires ?? "")) {
    fail("issue needs --expires as YYYY-MM-DD");
  }
  const expiresAt = new Date(`${values.expires}T23:59:59.999Z`);
  // 2027-02-30 parses, as 2 March: the key would outlive the date printed.
  if (
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.toISOString().slice(0, 10) !== values.expires
  )
    fail(`--expires ${values.expires} isn't a date`);
  if (expiresAt.getTime() <= Date.now())
    fail("--expires must be in the future");

  // A blank id (an unset shell variable) would make a key servers turn down.
  const id = values.id?.trim() || `lic_${randomBytes(6).toString("hex")}`;
  if (id.length > 100) fail("--id is at most 100 characters");
  const payload = {
    id,
    customer,
    issuedAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  if (values.features !== undefined) {
    const features = values.features
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
    const unknown = features.filter((f) => !FEATURES.includes(f));
    if (features.length === 0 || unknown.length > 0) {
      fail(`--features takes a comma-separated list of ${FEATURES.join(", ")}`);
    }
    payload.features = [...new Set(features)];
  }
  if (values.seats !== undefined) {
    const seats = Number(values.seats);
    if (!(Number.isInteger(seats) && seats > 0))
      fail("--seats must be a whole number above 0");
    payload.seats = seats;
  }

  let privateKey;
  try {
    privateKey = createPrivateKey(readFileSync(values["private-key"]));
  } catch (error) {
    fail(`couldn't read the private key: ${error?.message ?? error}`);
  }
  if (privateKey.asymmetricKeyType !== "ed25519")
    fail("the private key isn't an Ed25519 key");
  const trusted = trustedPublicKey();
  if (createPublicKey(privateKey).export({ format: "jwk" }).x !== trusted) {
    console.error(
      "license: warning: this private key doesn't match QRDX_LICENSE_PUBLIC_KEY (../license-public-key.ts). Production servers will turn this key down; it only works where the matching public key is trusted (tests, development)."
    );
  }

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signed = `${PREFIX}.${encoded}`;
  const signature = sign(null, Buffer.from(signed), privateKey).toString(
    "base64url"
  );
  console.error(
    `Licence ${payload.id} for ${customer}, valid through ${values.expires} (UTC)` +
      (payload.features
        ? `, ${payload.features.join(" and ")}`
        : ", every ee feature") +
      (payload.seats ? `, ${payload.seats} seats` : "") +
      ":"
  );
  console.log(`${signed}.${signature}`);
}

const [command, ...rest] = process.argv.slice(2);
if (command === "keygen") keygen(rest);
else if (command === "issue") issue(rest);
else {
  fail(
    "usage: license.mjs keygen --out <file> | issue --private-key <file> --customer <name> --expires YYYY-MM-DD [--features sso,auditLog] [--seats N] [--id ID]"
  );
}
