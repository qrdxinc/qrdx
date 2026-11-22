// Lightning (BOLT 11, LUD-01/06/16), XRP Ledger (classic addresses and
// XLS-5 X-addresses), Cardano (CIP-13/CIP-19), Tron, TON (deep links,
// TEP-2 addresses), Stellar (SEP-0007, SEP-0023) and the EIP-681 networks
// and stablecoins, against each spec's own vectors.
import { describe, expect, it } from "vitest";
import { parseScan } from "@/components/scanner/parse";
import {
  base58CheckDecode,
  crc16Xmodem,
  sha256,
  XRPL_ALPHABET,
} from "@/utils/crypto-checksums";
import {
  encodeCardano,
  encodeLightning,
  encodeLnurl,
  encodeStellar,
  encodeTon,
  encodeTron,
  encodeXrp,
  isStellarAddress,
  isTonAddress,
  lightningRequest,
  xrpXAddress,
} from "@/utils/crypto-payments";
import { encodeQRContent, validateContent } from "@/utils/qr-content-encoder";
import { BOLT11 } from "../support/bolt11-vectors";

const hex = (bytes: Uint8Array) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

describe("checksums", () => {
  it("SHA-256 matches FIPS 180-4's examples", () => {
    expect(hex(sha256(new TextEncoder().encode("abc")))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(hex(sha256(new Uint8Array()))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("CRC-16/XMODEM of 123456789 is 31C3", () => {
    expect(crc16Xmodem(new TextEncoder().encode("123456789"))).toBe(0x31c3);
  });
});

describe("Lightning", () => {
  it("writes BOLT 11's invoices upper case after lightning:", () => {
    const payload = encodeLightning({
      type: "lightning",
      request: BOLT11.donation,
    });
    expect(payload).toBe(`lightning:${BOLT11.donation.toUpperCase()}`);
    expect(
      encodeLightning({
        type: "lightning",
        request: `lightning:${BOLT11.upper}`,
      }),
    ).toBe(`lightning:${BOLT11.upper}`);
  });

  it("reads the amount from the prefix", () => {
    const request = lightningRequest(BOLT11.u2500);
    expect("msat" in request && request.msat).toBe(250_000_000n);
  });

  it("refuses broken, mixed-case and test-network invoices", () => {
    const broken = `${BOLT11.donation.slice(0, -1)}q`;
    expect("message" in lightningRequest(broken)).toBe(true);
    const mixed = `${BOLT11.donation.slice(0, 20).toUpperCase()}${BOLT11.donation.slice(20)}`;
    expect("message" in lightningRequest(mixed)).toBe(true);
    expect(validateContent({ type: "lightning", request: "lnbc1" }).valid).toBe(
      false,
    );
  });

  it("writes LUD-01's LNURL example", () => {
    expect(
      encodeLnurl(
        "https://service.com/api?q=3fc3645b439ce8e7f2553a69e5267081d96dcd340693afabe04be7b0ccd178df",
      ),
    ).toBe(
      "LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS",
    );
  });

  it("turns a Lightning Address into its LNURL-pay (LUD-16)", () => {
    expect(
      encodeLightning({ type: "lightning", request: "Satoshi@Bitcoin.org" }),
    ).toBe(encodeLnurl("https://bitcoin.org/.well-known/lnurlp/satoshi"));
  });

  it("scans invoices and LNURLs", () => {
    const parsed = parseScan(`lightning:${BOLT11.u2500.toUpperCase()}`);
    expect(parsed).toMatchObject({
      kind: "payment",
      scheme: "lightning",
      amount: "250,000 sats",
    });
    const lnurl = parseScan(encodeLnurl("https://service.com/api"));
    expect(lnurl).toMatchObject({ scheme: "lightning", payee: "service.com" });
  });
});

describe("XRP Ledger", () => {
  const ACCOUNT = "rGWrZyQqhTp9Xu7G5Pkayo7bXjH4k4QYpf";

  it.each([
    [undefined, "XVLhHMPHU98es4dbozjVtdWzVrDjtV5fdx1mHp98tDMoQXb"],
    [0, "XVLhHMPHU98es4dbozjVtdWzVrDjtV8AqEL4xcZj5whKbmc"],
    [276, "XVLhHMPHU98es4dbozjVtdWzVrDjtVoKj3MnFGMXEFMnvJV"],
    [4294967295, "XVLhHMPHU98es4dbozjVtdWzVrDjtV18pX8yuPT7y4xaEHi"],
  ])("XLS-5: tag %s → %s", (tag, xAddress) => {
    expect(xrpXAddress(ACCOUNT, tag)).toBe(xAddress);
  });

  it("writes the plain address, or the X-address with a tag", () => {
    expect(encodeXrp({ type: "xrp", address: ACCOUNT })).toBe(ACCOUNT);
    expect(
      encodeXrp({ type: "xrp", address: ACCOUNT, destinationTag: "276" }),
    ).toBe("XVLhHMPHU98es4dbozjVtdWzVrDjtVoKj3MnFGMXEFMnvJV");
  });

  it("checks the address's checksum and the tag's range", () => {
    expect(
      base58CheckDecode("rDTXLQ7ZKZVKz33zJbHjgVShjsBnqMBhmN", XRPL_ALPHABET),
    ).not.toBeNull();
    expect(
      encodeXrp({ type: "xrp", address: "rGWrZyQqhTp9Xu7G5Pkayo7bXjH4k4QYpg" }),
    ).toBe("");
    expect(
      validateContent({
        type: "xrp",
        address: ACCOUNT,
        destinationTag: "4294967296",
      }).valid,
    ).toBe(false);
  });

  it("scans plain and X-addresses, tag included", () => {
    expect(parseScan(ACCOUNT)).toMatchObject({ scheme: "xrp", payee: ACCOUNT });
    const tagged = parseScan("XVLhHMPHU98es4dbozjVtdWzVrDjtVoKj3MnFGMXEFMnvJV");
    expect(tagged.kind === "payment" && tagged.fields).toContainEqual({
      label: "Destination tag",
      value: "276",
    });
  });
});

describe("Cardano (CIP-13)", () => {
  const ADDRESS = "addr1vx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzers66hrl8";

  it("writes web+cardano: with the amount in ADA", () => {
    expect(
      encodeCardano({ type: "cardano", address: ADDRESS, amount: "12.5" }),
    ).toBe(`web+cardano:${ADDRESS}?amount=12.5`);
    expect(
      encodeCardano({
        type: "cardano",
        address:
          "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x",
      }),
    ).toMatch(/^web\+cardano:addr1qx2/);
  });

  it.each([
    "stake1uyehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gh6ffgw",
    "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgs68faae",
    `${ADDRESS.slice(0, -1)}q`,
  ])("refuses %s", (address) => {
    expect(validateContent({ type: "cardano", address }).valid).toBe(false);
  });
});

describe("Tron", () => {
  it("writes the plain address and refuses the USDT contract", () => {
    expect(
      encodeTron({
        type: "tron",
        address: "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
      }),
    ).toBe("TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL");
    expect(
      encodeTron({
        type: "tron",
        address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      }),
    ).toBe("");
    expect(
      encodeTron({
        type: "tron",
        address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u",
      }),
    ).toBe("");
    expect(parseScan("TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL")).toMatchObject({
      scheme: "tron",
    });
  });
});

describe("TON", () => {
  const TO = "UQDYzZmfsrGzhObKJUw4gzdeIxEai3jAFbiGKGwxvxHinf4K";

  it("writes the deep link docs' examples", () => {
    expect(encodeTon({ type: "ton", address: TO })).toBe(
      `ton://transfer/${TO}`,
    );
    expect(
      encodeTon({
        type: "ton",
        address: TO,
        amount: "0.005",
        message: "hello",
      }),
    ).toBe(`ton://transfer/${TO}?amount=5000000&text=hello`);
    expect(
      encodeTon({
        type: "ton",
        address: TO,
        token: "USDT",
        amount: "0.005",
        message: "hello",
      }),
    ).toBe(
      `ton://transfer/${TO}?jetton=EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs&amount=5000&text=hello`,
    );
  });

  it("checks TEP-2 addresses and refuses testnet and raw forms", () => {
    expect(
      isTonAddress("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF"),
    ).toBe(true);
    expect(
      isTonAddress("UQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPuwA"),
    ).toBe(true);
    expect(
      isTonAddress("kQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPgpP"),
    ).toBe(false);
    expect(
      isTonAddress("UQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPuwB"),
    ).toBe(false);
    expect(
      validateContent({
        type: "ton",
        address:
          "0:ca6e321c7cce9ecedf0a8ca2492ec8592494aa5fb5ce0387dff96ef6af982a3e",
      }).valid,
    ).toBe(false);
  });

  it("scans the amount back in TON or USDT", () => {
    expect(parseScan(`ton://transfer/${TO}?amount=5000000`)).toMatchObject({
      scheme: "ton",
      amount: "0.005 TON",
    });
  });
});

describe("Stellar (SEP-0007)", () => {
  const TO = "GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO";

  it("writes the spec's example (without its msg)", () => {
    expect(
      encodeStellar({
        type: "stellar",
        address: TO,
        amount: "120.1234567",
        memo: "skdjfasf",
      }),
    ).toBe(
      `web+stellar:pay?destination=${TO}&amount=120.1234567&memo=skdjfasf&memo_type=MEMO_TEXT`,
    );
    expect(
      encodeStellar({
        type: "stellar",
        address: TO,
        token: "USDC",
        amount: "5",
      }),
    ).toBe(
      `web+stellar:pay?destination=${TO}&amount=5&asset_code=USDC&asset_issuer=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`,
    );
  });

  it.each([
    ["GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ", true],
    [
      "MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAAAAAAAAAAAAJLK",
      true,
    ],
    ["GAAAAAAAACGC6", false],
    ["G47QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVP2I", false],
    ["GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGA", false],
  ])("SEP-0023: %s is %s", (address, valid) => {
    expect(isStellarAddress(address)).toBe(valid);
  });
});

describe("EIP-681 networks and stablecoins", () => {
  const TO = "0x8e23ee67d1332ad560396262c48ffbb01f93d052";

  it("keeps mainnet ETH codes as they were", () => {
    expect(
      encodeQRContent({ type: "ethereum", address: TO, amount: "0.5" }),
    ).toBe(`ethereum:${TO}?value=0.5e18`);
    expect(
      encodeQRContent({
        type: "ethereum",
        address: TO,
        amount: "0.5",
        network: "1",
      }),
    ).toBe(`ethereum:${TO}?value=0.5e18`);
  });

  it("names other networks with @chainId", () => {
    expect(
      encodeQRContent({
        type: "ethereum",
        address: TO,
        amount: "0.01",
        network: "56",
      }),
    ).toBe(`ethereum:${TO}@56?value=0.01e18`);
  });

  it("writes stablecoins as transfers to the issuer's contract, in base units", () => {
    expect(
      encodeQRContent({
        type: "ethereum",
        address: TO,
        network: "8453",
        token: "USDC",
        amount: "1.5",
      }),
    ).toBe(
      `ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453/transfer?address=${TO}&uint256=1500000`,
    );
    expect(
      encodeQRContent({
        type: "ethereum",
        address: TO,
        network: "1",
        token: "USDT",
        amount: "1.5",
      }),
    ).toBe(
      `ethereum:0xdAC17F958D2ee523a2206206994597C13D831ec7@1/transfer?address=${TO}&uint256=1500000`,
    );
  });

  it("refuses tokens the issuer doesn't list and token contracts as recipients", () => {
    expect(
      validateContent({
        type: "ethereum",
        address: TO,
        network: "56",
        token: "USDT",
      }).valid,
    ).toBe(false);
    expect(
      validateContent({
        type: "ethereum",
        address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      }).valid,
    ).toBe(false);
  });

  it("adds Solana Pay's spl-token for USDC and USDT", () => {
    expect(
      encodeQRContent({
        type: "solana",
        address: "mvines9iiHiQTysrwkJjGf2gb9Ex9jXJX8ns3qwf2kN",
        amount: "0.01",
        token: "USDC",
      }),
    ).toBe(
      "solana:mvines9iiHiQTysrwkJjGf2gb9Ex9jXJX8ns3qwf2kN?amount=0.01&spl-token=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    );
    expect(
      validateContent({
        type: "solana",
        address: "mvines9iiHiQTysrwkJjGf2gb9Ex9jXJX8ns3qwf2kN",
        amount: "0.0000001",
        token: "USDT",
      }).valid,
    ).toBe(false);
  });
});
