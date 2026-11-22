// Payment requests for more chains, each in the format its own spec or
// wallets document:
//
// - Lightning: a BOLT 11 invoice as lightning:<INVOICE> (upper case, as
//   BOLT 11 asks for QR codes), or a static LNURL-pay (LUD-01/06), which a
//   Lightning Address (LUD-16) is turned into.
// - XRP Ledger: no URI is final, so the plain classic address, or an
//   X-address (XLS-5) when there's a destination tag.
// - Cardano: web+cardano:<address>?amount=<ADA> (CIP-13).
// - Tron: no static URI is documented, so the plain T… address.
// - TON: ton://transfer/<address>?amount=<nano>&text=… (+ jetton for USDT).
// - Stellar: web+stellar:pay?destination=… (SEP-0007).
// - EVM networks and stablecoins for the ethereum type: EIP-681 with
//   @chainId and /transfer.
//
// Stablecoin contracts are the ones Tether and Circle list themselves.

import type {
  CardanoContent,
  LightningContent,
  StellarContent,
  TonContent,
  TronContent,
  XrpContent,
} from "@/types/qr-content";
import {
  base32Decode,
  base58CheckDecode,
  base58CheckEncode,
  base64Decode,
  bech32Decode,
  bech32Encode,
  convertBits,
  crc16Xmodem,
  XRPL_ALPHABET,
} from "./crypto-checksums";

export interface CryptoIssue {
  field?: string;
  message: string;
}

const issue = (field: string, message: string): CryptoIssue => ({
  field,
  message,
});

/** A positive decimal with at most `decimals` places, as typed ("," allowed). */
export function cryptoAmount(
  raw: string | undefined,
  decimals: number,
): string | null {
  let value = raw?.trim() ?? "";
  if (/^\d+,\d+$/.test(value)) value = value.replace(",", ".");
  const pattern =
    decimals > 0 ? new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`) : /^\d+$/;
  if (!pattern.test(value) || /^0+(?:\.0+)?$/.test(value)) return null;
  return value.replace(/^0+(?=\d)/, "");
}

/** A decimal amount in base units ("1.5", 6 → "1500000"). */
export function baseUnits(amount: string, decimals: number): string {
  const [whole = "", fraction = ""] = amount.split(".");
  return BigInt(`${whole}${fraction.padEnd(decimals, "0")}`).toString();
}

const amountIssue = (
  raw: string | undefined,
  decimals: number,
  unit: string,
) =>
  raw?.trim() && !cryptoAmount(raw, decimals)
    ? issue(
        "amount",
        `Enter an amount in ${unit} with up to ${decimals} decimals`,
      )
    : null;

// ─── Lightning ──────────────────────────────────────────────────────────────

/** BOLT 11's human-readable part: network and optional amount. */
const BOLT11_HRP = /^ln(bcrt|bc|tbs|tb)(\d*)([munp]?)$/;

export type LightningRequest =
  | { kind: "invoice"; invoice: string; network: string; msat?: bigint }
  | { kind: "lnurl"; lnurl: string; url: string }
  | { kind: "address"; lnurl: string; address: string };

/** The amount in millisatoshi a BOLT 11 prefix asks for, if any. */
function bolt11Msat(digits: string, multiplier: string): bigint | undefined {
  if (!digits) return undefined;
  const scale: Record<string, bigint> = {
    "": 100_000_000_000n,
    m: 100_000_000n,
    u: 100_000n,
    n: 100n,
  };
  if (multiplier === "p") return BigInt(digits) / 10n;
  return BigInt(digits) * (scale[multiplier] as bigint);
}

/** LNURL (LUD-01): the URL's UTF-8 bytes in Bech32 with the lnurl prefix. */
export function encodeLnurl(url: string): string {
  const words = convertBits(new TextEncoder().encode(url), 8, 5, true) ?? [];
  return bech32Encode("lnurl", words).toUpperCase();
}

/** What a pasted Lightning invoice, LNURL or Lightning Address is. */
export function lightningRequest(raw: string): LightningRequest | CryptoIssue {
  const value = raw.trim().replace(/^lightning:/i, "");
  if (!value) {
    return issue(
      "request",
      "Paste an invoice, an LNURL or a Lightning Address",
    );
  }
  if (value.includes("@")) {
    const address = value.toLowerCase();
    const match = /^([a-z0-9._+-]+)@((?:[a-z0-9-]+\.)+[a-z]{2,})$/.exec(
      address,
    );
    if (!match) {
      return issue("request", "Lightning Addresses look like name@domain.com");
    }
    const [, user, domain] = match as unknown as [string, string, string];
    return {
      kind: "address",
      address,
      lnurl: encodeLnurl(`https://${domain}/.well-known/lnurlp/${user}`),
    };
  }
  const decoded = bech32Decode(value);
  if (!decoded) {
    return issue(
      "request",
      /^(ln|lnurl)/i.test(value)
        ? "This doesn't check out: copy the whole invoice or LNURL again"
        : "Paste an invoice (lnbc…), an LNURL (lnurl1…) or a Lightning Address",
    );
  }
  if (decoded.hrp === "lnurl") {
    const bytes = convertBits(decoded.words, 5, 8, false);
    const url = bytes ? new TextDecoder().decode(new Uint8Array(bytes)) : "";
    if (!/^https:\/\/|^http:\/\/[a-z2-7]{16,56}\.onion/i.test(url)) {
      return issue("request", "This LNURL doesn't hold an https:// address");
    }
    return { kind: "lnurl", lnurl: value.toUpperCase(), url };
  }
  const hrp = BOLT11_HRP.exec(decoded.hrp);
  if (!hrp) {
    return issue("request", "This isn't a Lightning invoice or LNURL");
  }
  const [, network = "", digits = "", multiplier = ""] = hrp;
  if (
    digits.startsWith("0") ||
    (!digits && multiplier) ||
    (multiplier === "p" && !digits.endsWith("0"))
  ) {
    return issue("request", "This invoice's amount isn't valid");
  }
  // A timestamp (7 words) and a signature (104 words) at the least.
  if (decoded.words.length < 111) {
    return issue("request", "This invoice is too short to be complete");
  }
  if (network !== "bc") {
    return issue(
      "request",
      "This is a test-network invoice. Use a mainnet one (lnbc…).",
    );
  }
  return {
    kind: "invoice",
    invoice: value.toUpperCase(),
    network,
    msat: bolt11Msat(digits, multiplier),
  };
}

export function lightningIssue(
  content: Partial<LightningContent>,
): CryptoIssue | null {
  if (!content.request?.trim()) {
    return issue("request", "Invoice, LNURL or Lightning Address is required");
  }
  const request = lightningRequest(content.request);
  return "message" in request ? request : null;
}

/**
 * An invoice as lightning:<INVOICE>; an LNURL, or a Lightning Address
 * turned into its LNURL-pay, as the bare upper case LNURL LUD-06 scans.
 */
export function encodeLightning(content: LightningContent): string {
  const request = lightningRequest(content.request ?? "");
  if ("message" in request) return "";
  return request.kind === "invoice"
    ? `lightning:${request.invoice}`
    : request.lnurl;
}

// ─── XRP Ledger ─────────────────────────────────────────────────────────────

/** A classic address's 20-byte account ID, when its checksum is right. */
function xrpAccountId(raw: string): Uint8Array | null {
  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(raw)) return null;
  const payload = base58CheckDecode(raw, XRPL_ALPHABET);
  return payload && payload.length === 21 && payload[0] === 0
    ? payload.slice(1)
    : null;
}

/** XLS-5: prefix 0x05 0x44, account ID, flag, tag (8 bytes, little-endian). */
export function xrpXAddress(classic: string, tag?: number): string | null {
  const account = xrpAccountId(classic);
  if (!account) return null;
  const bytes = new Uint8Array(31);
  bytes.set([0x05, 0x44]);
  bytes.set(account, 2);
  if (tag !== undefined) {
    bytes[22] = 1;
    new DataView(bytes.buffer).setUint32(23, tag, true);
  }
  return base58CheckEncode(bytes, XRPL_ALPHABET);
}

export function xrpIssue(content: Partial<XrpContent>): CryptoIssue | null {
  const address = content.address?.trim() ?? "";
  if (!address) return issue("address", "XRP address is required");
  if (address.startsWith("X")) {
    return issue(
      "address",
      "Paste the classic address (r…) and put the tag in its own field",
    );
  }
  if (!xrpAccountId(address)) {
    return issue("address", "Enter a valid XRP Ledger address (r…)");
  }
  const tag = content.destinationTag?.trim();
  if (tag && (!/^\d{1,10}$/.test(tag) || Number(tag) > 4_294_967_295)) {
    return issue(
      "destinationTag",
      "Destination tags are whole numbers up to 4294967295",
    );
  }
  return null;
}

/** The plain classic address, or its X-address with a destination tag. */
export function encodeXrp(content: XrpContent): string {
  if (xrpIssue(content)) return "";
  const address = content.address.trim();
  const tag = content.destinationTag?.trim();
  return tag ? (xrpXAddress(address, Number(tag)) ?? "") : address;
}

// ─── Cardano (CIP-13) ───────────────────────────────────────────────────────

/** A mainnet Shelley payment address (CIP-19): addr1…, header types 0-7. */
export function isCardanoAddress(raw: string): boolean {
  const decoded = bech32Decode(raw);
  if (!decoded || decoded.hrp !== "addr") return false;
  const bytes = convertBits(decoded.words, 5, 8, false);
  if (!bytes || bytes.length < 29) return false;
  const header = bytes[0] as number;
  return header >> 4 <= 7 && (header & 0x0f) === 1;
}

export function cardanoIssue(
  content: Partial<CardanoContent>,
): CryptoIssue | null {
  const address = content.address?.trim() ?? "";
  if (!address) return issue("address", "Cardano address is required");
  if (/^stake/i.test(address)) {
    return issue(
      "address",
      "This is a stake address. Paste a payment address (addr1…).",
    );
  }
  if (/^addr_test/i.test(address)) {
    return issue(
      "address",
      "This is a testnet address. Use a mainnet one (addr1…).",
    );
  }
  if (!isCardanoAddress(address)) {
    return issue("address", "Enter a Cardano payment address (addr1…)");
  }
  return amountIssue(content.amount, 6, "ADA");
}

export function encodeCardano(content: CardanoContent): string {
  if (cardanoIssue(content)) return "";
  const amount = content.amount?.trim()
    ? cryptoAmount(content.amount, 6)
    : null;
  return `web+cardano:${content.address.trim()}${amount ? `?amount=${amount}` : ""}`;
}

// ─── Tron ───────────────────────────────────────────────────────────────────

/** Tether's USDT contract on Tron, which is never a receiving address. */
export const TRON_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

export function isTronAddress(raw: string): boolean {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(raw)) return false;
  const payload = base58CheckDecode(raw);
  return payload?.length === 21 && payload[0] === 0x41;
}

export function tronIssue(content: Partial<TronContent>): CryptoIssue | null {
  const address = content.address?.trim() ?? "";
  if (!address) return issue("address", "Tron address is required");
  if (address === TRON_USDT_CONTRACT) {
    return issue(
      "address",
      "This is the USDT contract, not your wallet. Paste your own address.",
    );
  }
  return isTronAddress(address)
    ? null
    : issue("address", "Enter a valid Tron address (T…)");
}

/** The plain address: Tron wallets document no static request URI. */
export function encodeTron(content: TronContent): string {
  return tronIssue(content) ? "" : content.address.trim();
}

// ─── TON ────────────────────────────────────────────────────────────────────

/** Tether's USDT jetton master on TON. */
export const TON_USDT_JETTON =
  "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";

/**
 * A user-friendly TON address (TEP-2): 36 bytes in Base64 or Base64url,
 * a bounceable (0x11) or non-bounceable (0x51) mainnet flag, and a
 * CRC-16/XMODEM over the first 34 bytes.
 */
export function isTonAddress(raw: string): boolean {
  if (raw.length !== 48) return false;
  const bytes = base64Decode(raw);
  if (!bytes || bytes.length !== 36) return false;
  if (bytes[0] !== 0x11 && bytes[0] !== 0x51) return false;
  const crc = crc16Xmodem(bytes.slice(0, 34));
  return bytes[34] === crc >> 8 && bytes[35] === (crc & 0xff);
}

const TON_DECIMALS = { TON: 9, USDT: 6 } as const;

export function tonIssue(content: Partial<TonContent>): CryptoIssue | null {
  const address = content.address?.trim() ?? "";
  if (!address) return issue("address", "TON address is required");
  if (/^-?\d+:[0-9a-f]{64}$/i.test(address)) {
    return issue(
      "address",
      "Paste the address your wallet shows (UQ… or EQ…), which has a checksum",
    );
  }
  if (!isTonAddress(address)) {
    return issue("address", "Enter a valid mainnet TON address (UQ… or EQ…)");
  }
  const token = content.token ?? "TON";
  if (token !== "TON" && token !== "USDT") {
    return issue("token", "Pick TON or USDT");
  }
  return amountIssue(
    content.amount,
    TON_DECIMALS[token],
    token === "USDT" ? "USDT" : "TON",
  );
}

/** ton://transfer/<address>, amounts in nanotons or USDT's micro-units. */
export function encodeTon(content: TonContent): string {
  if (tonIssue(content)) return "";
  const token = content.token ?? "TON";
  const params: string[] = [];
  if (token === "USDT") params.push(`jetton=${TON_USDT_JETTON}`);
  const amount = content.amount?.trim()
    ? cryptoAmount(content.amount, TON_DECIMALS[token])
    : null;
  if (amount) params.push(`amount=${baseUnits(amount, TON_DECIMALS[token])}`);
  const text = content.message?.trim();
  if (text) params.push(`text=${encodeURIComponent(text)}`);
  return `ton://transfer/${content.address.trim()}${params.length ? `?${params.join("&")}` : ""}`;
}

// ─── Stellar (SEP-0007) ─────────────────────────────────────────────────────

/** Circle's USDC on Stellar. */
export const STELLAR_USDC_ISSUER =
  "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

/**
 * A Stellar account (G…, version byte 48) or muxed account (M…, 96) as
 * SEP-0023 StrKey: Base32, CRC-16/XMODEM little-endian, and the string
 * re-encodes exactly.
 */
export function isStellarAddress(raw: string): boolean {
  const version = raw.startsWith("G") ? 48 : raw.startsWith("M") ? 96 : 0;
  const length = version === 48 ? 56 : 69;
  if (!version || raw.length !== length) return false;
  const bytes = base32Decode(raw);
  if (!bytes || bytes[0] !== version) return false;
  const body = bytes.slice(0, -2);
  const crc = crc16Xmodem(body);
  return (
    bytes[bytes.length - 2] === (crc & 0xff) &&
    bytes[bytes.length - 1] === crc >> 8
  );
}

export function stellarIssue(
  content: Partial<StellarContent>,
): CryptoIssue | null {
  const address = content.address?.trim() ?? "";
  if (!address) return issue("address", "Stellar address is required");
  if (!isStellarAddress(address)) {
    return issue("address", "Enter a valid Stellar address (G…)");
  }
  const token = content.token ?? "XLM";
  if (token !== "XLM" && token !== "USDC") {
    return issue("token", "Pick XLM or USDC");
  }
  const amount = amountIssue(content.amount, 7, token);
  if (amount) return amount;
  if (new TextEncoder().encode(content.memo?.trim() ?? "").length > 28) {
    return issue("memo", "Text memos are at most 28 bytes");
  }
  return null;
}

/** A SEP-0007 pay request, with a text memo and Circle's USDC if chosen. */
export function encodeStellar(content: StellarContent): string {
  if (stellarIssue(content)) return "";
  const params = [`destination=${content.address.trim()}`];
  const amount = content.amount?.trim()
    ? cryptoAmount(content.amount, 7)
    : null;
  if (amount) params.push(`amount=${amount}`);
  if (content.token === "USDC") {
    params.push("asset_code=USDC", `asset_issuer=${STELLAR_USDC_ISSUER}`);
  }
  const memo = content.memo?.trim();
  if (memo) {
    params.push(`memo=${encodeURIComponent(memo)}`, "memo_type=MEMO_TEXT");
  }
  return `web+stellar:pay?${params.join("&")}`;
}

// ─── EVM networks and stablecoins (EIP-681) ─────────────────────────────────

export interface EvmNetwork {
  chainId: string;
  name: string;
  /** The network's own coin */
  coin: string;
  /** Issuer-listed stablecoin contracts (Tether, Circle), all 6 decimals */
  tokens: Partial<Record<"USDT" | "USDC", string>>;
}

/** Chain IDs from ethereum-lists/chains; contracts from Tether's and Circle's pages. */
export const EVM_NETWORKS: readonly EvmNetwork[] = [
  {
    chainId: "1",
    name: "Ethereum",
    coin: "ETH",
    tokens: {
      USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    },
  },
  { chainId: "56", name: "BNB Smart Chain", coin: "BNB", tokens: {} },
  {
    chainId: "137",
    name: "Polygon",
    coin: "POL",
    tokens: { USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" },
  },
  {
    chainId: "42161",
    name: "Arbitrum One",
    coin: "ETH",
    tokens: { USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
  },
  {
    chainId: "10",
    name: "OP Mainnet",
    coin: "ETH",
    tokens: { USDC: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" },
  },
  {
    chainId: "8453",
    name: "Base",
    coin: "ETH",
    tokens: { USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  },
  {
    chainId: "43114",
    name: "Avalanche C-Chain",
    coin: "AVAX",
    tokens: {
      USDT: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
      USDC: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    },
  },
];

export const evmNetwork = (chainId: string | undefined) =>
  EVM_NETWORKS.find((network) => network.chainId === (chainId || "1"));

/** Every issuer-listed token contract, lower case, to refuse as a recipient. */
const TOKEN_CONTRACTS = new Set(
  EVM_NETWORKS.flatMap((network) =>
    Object.values(network.tokens).map((address) => address.toLowerCase()),
  ),
);

export const isTokenContract = (address: string) =>
  TOKEN_CONTRACTS.has(address.trim().toLowerCase());

/** Stablecoins on EVM networks, Solana, TON and Stellar all use 6 decimals here. */
export const STABLECOIN_DECIMALS = 6;

// ─── Solana Pay tokens ──────────────────────────────────────────────────────

/** SPL mints as Tether and Circle list them; both use 6 decimals. */
export const SOLANA_TOKEN_MINTS = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
} as const;
