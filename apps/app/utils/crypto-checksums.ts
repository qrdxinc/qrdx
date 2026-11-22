// Checksums and encodings for crypto addresses, without dependencies and
// synchronous, so forms can check an address on every keystroke: SHA-256
// (FIPS 180-4), Base58 (Bitcoin's and the XRP Ledger's alphabets), Bech32
// (BIP-173) without the 90-character limit Lightning invoices and Cardano
// addresses exceed, CRC-16/XMODEM (TON and Stellar), RFC 4648 Base32 and
// Base64/Base64url.

// ─── SHA-256 ────────────────────────────────────────────────────────────────

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (value: number, bits: number) =>
  (value >>> bits) | (value << (32 - bits));

/** SHA-256 of `data`. */
export function sha256(data: Uint8Array): Uint8Array {
  const length = data.length;
  const padded = new Uint8Array(Math.ceil((length + 9) / 64) * 64);
  padded.set(data);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(length / 0x20000000));
  view.setUint32(padded.length - 4, (length * 8) >>> 0);
  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  for (let block = 0; block < padded.length; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15] as number;
      const b = w[i - 2] as number;
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = ((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash as unknown as number[] as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choice = (e & f) ^ (~e & g);
      const t1 = (h + s1 + choice + (K[i] as number) + (w[i] as number)) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    const sums = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i++) {
      hash[i] = ((hash[i] as number) + (sums[i] as number)) >>> 0;
    }
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, hash[i] as number);
  return out;
}

/** The first 4 bytes of SHA-256(SHA-256(data)): Base58Check's checksum. */
export function doubleSha256Checksum(data: Uint8Array): Uint8Array {
  return sha256(sha256(data)).slice(0, 4);
}

// ─── Base58 ─────────────────────────────────────────────────────────────────

export const BITCOIN_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const XRPL_ALPHABET =
  "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";

export function base58Decode(
  text: string,
  alphabet = BITCOIN_ALPHABET,
): Uint8Array | null {
  let value = 0n;
  for (const char of text) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) return null;
    value = value * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value % 256n));
    value /= 256n;
  }
  const zeros =
    text.length - text.replace(new RegExp(`^${alphabet[0]}+`), "").length;
  return new Uint8Array([...new Array(zeros).fill(0), ...bytes]);
}

export function base58Encode(
  bytes: Uint8Array,
  alphabet = BITCOIN_ALPHABET,
): string {
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let out = "";
  while (value > 0n) {
    out = (alphabet[Number(value % 58n)] as string) + out;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = (alphabet[0] as string) + out;
  }
  return out;
}

/** Base58Check: the payload when its double SHA-256 checksum matches. */
export function base58CheckDecode(
  text: string,
  alphabet = BITCOIN_ALPHABET,
): Uint8Array | null {
  const bytes = base58Decode(text, alphabet);
  if (!bytes || bytes.length < 5) return null;
  const payload = bytes.slice(0, -4);
  const checksum = doubleSha256Checksum(payload);
  return checksum.every(
    (byte, index) => byte === bytes[bytes.length - 4 + index],
  )
    ? payload
    : null;
}

export function base58CheckEncode(
  payload: Uint8Array,
  alphabet = BITCOIN_ALPHABET,
): string {
  return base58Encode(
    new Uint8Array([...payload, ...doubleSha256Checksum(payload)]),
    alphabet,
  );
}

// ─── Bech32 (BIP-173), no length limit ──────────────────────────────────────

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) checksum ^= GENERATORS[i] as number;
    }
  }
  return checksum;
}

const expandHrp = (hrp: string) => [
  ...[...hrp].map((char) => char.charCodeAt(0) >>> 5),
  0,
  ...[...hrp].map((char) => char.charCodeAt(0) & 31),
];

export interface Bech32 {
  /** Lower case */
  hrp: string;
  /** 5-bit words, without the checksum */
  words: number[];
}

/**
 * A Bech32 string's parts when its checksum is right. Single case only,
 * as BIP-173 requires; there's no length limit.
 */
export function bech32Decode(text: string): Bech32 | null {
  if (text !== text.toLowerCase() && text !== text.toUpperCase()) return null;
  const value = text.toLowerCase();
  const separator = value.lastIndexOf("1");
  if (separator < 1 || value.length - separator - 1 < 6) return null;
  const hrp = value.slice(0, separator);
  if (!/^[\x21-\x7e]+$/.test(hrp)) return null;
  const words: number[] = [];
  for (const char of value.slice(separator + 1)) {
    const word = BECH32_CHARSET.indexOf(char);
    if (word < 0) return null;
    words.push(word);
  }
  if (polymod([...expandHrp(hrp), ...words]) !== 1) return null;
  return { hrp, words: words.slice(0, -6) };
}

export function bech32Encode(hrp: string, words: number[]): string {
  const values = [...expandHrp(hrp), ...words, 0, 0, 0, 0, 0, 0];
  const mod = polymod(values) ^ 1;
  const checksum = [0, 1, 2, 3, 4, 5].map((i) => (mod >>> (5 * (5 - i))) & 31);
  return `${hrp}1${[...words, ...checksum].map((word) => BECH32_CHARSET[word]).join("")}`;
}

/** Regroups bits (8 → 5 to encode, 5 → 8 to decode). */
export function convertBits(
  data: ArrayLike<number>,
  from: number,
  to: number,
  pad: boolean,
): number[] | null {
  let accumulator = 0;
  let bits = 0;
  const out: number[] = [];
  const max = (1 << to) - 1;
  for (let i = 0; i < data.length; i++) {
    accumulator = (accumulator << from) | (data[i] as number);
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((accumulator >>> bits) & max);
    }
  }
  if (pad) {
    if (bits > 0) out.push((accumulator << (to - bits)) & max);
  } else if (bits >= from || ((accumulator << (to - bits)) & max) !== 0) {
    return null;
  }
  return out;
}

// ─── CRC-16/XMODEM ──────────────────────────────────────────────────────────

/** CRC-16/XMODEM: polynomial 0x1021, initial value 0, no reflection. */
export function crc16Xmodem(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

// ─── Base32 (RFC 4648, no padding) and Base64 ───────────────────────────────

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(text: string): Uint8Array | null {
  const words: number[] = [];
  for (const char of text) {
    const word = BASE32.indexOf(char);
    if (word < 0) return null;
    words.push(word);
  }
  const bytes = convertBits(words, 5, 8, false);
  return bytes ? new Uint8Array(bytes) : null;
}

export function base32Encode(bytes: Uint8Array): string {
  return (convertBits(bytes, 8, 5, true) ?? [])
    .map((word) => BASE32[word])
    .join("");
}

/** Base64 or Base64url, with or without padding. */
export function base64Decode(text: string): Uint8Array | null {
  const standard = text.replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(standard)) return null;
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const words = [...standard.replace(/=+$/, "")].map((char) =>
    alphabet.indexOf(char),
  );
  const bytes = convertBits(words, 6, 8, false);
  return bytes ? new Uint8Array(bytes) : null;
}
