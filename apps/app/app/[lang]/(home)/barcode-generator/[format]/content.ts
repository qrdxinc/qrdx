// The /barcode-generator/<format> pages' copy, in English: one page per
// symbology in lib/barcode/formats.ts. Translations come from the
// translation memory (lib/i18n/content-sources.ts lists this file).
//
// Input rules and check digits come from lib/barcode/formats.ts and are
// worked out on the page; the copy here explains them. GS1 sizes are from
// the GS1 General Specifications. DOWNLOAD_SIZES_MM is what the vector
// downloads of each format's example measure at the default settings;
// tests/barcode/format-pages.test.ts draws them and fails when they drift.
import type { BarcodeFormatId } from "@/lib/barcode/formats";

export interface BarcodeFormatPage {
  id: BarcodeFormatId;
  /** The URL segment: /barcode-generator/<slug> */
  slug: string;
  /** H1 and <title> (before the "| QRdx" suffix) */
  title: string;
  /** At most 155 characters */
  metaDescription: string;
  /** The hero paragraph */
  intro: string;
  /** "Where <name> barcodes are used" */
  usedFor: string[];
  /** Do you need GS1 numbers (or anything else) for it */
  numbers: { title: string; paragraphs: string[] };
  /** How the input and check digit work, beside the worked example */
  rules: string[];
  /** Print size guidance, beside the download size */
  sizing: string[];
  faqs: { question: string; answer: string }[];
}

/**
 * Width × height of the example's SVG, PDF and EPS at the default settings,
 * rounded as the generator shows them.
 */
export const DOWNLOAD_SIZES_MM: Record<
  BarcodeFormatId,
  { width: number; height: number }
> = {
  ean13: { width: 45.1, height: 27.8 },
  ean8: { width: 28.6, height: 22.8 },
  upca: { width: 47.2, height: 27.8 },
  upce: { width: 30.3, height: 27.8 },
  isbn: { width: 50.1, height: 31 },
  issn: { width: 55.3, height: 31 },
  ismn: { width: 50.1, height: 31 },
  code128: { width: 69.9, height: 19.2 },
  code39: { width: 57.5, height: 19.2 },
  code93: { width: 42.3, height: 19.2 },
  codabar: { width: 37.7, height: 19.2 },
  itf14: { width: 60.4, height: 31.7 },
  "gs1-128": { width: 100.9, height: 19.2 },
  "gs1-databar": { width: 46.6, height: 19.2 },
  "gs1-databar-expanded": { width: 105.8, height: 19.2 },
  "intelligent-mail": { width: 88.4, height: 9.6 },
  datamatrix: { width: 15.5, height: 15.5 },
  pdf417: { width: 43.7, height: 8.8 },
  aztec: { width: 19, height: 19 },
  microqr: { width: 14.8, height: 14.8 },
  rmqr: { width: 44.4, height: 7.8 },
  maxicode: { width: 31.9, height: 30.6 },
  dotcode: { width: 25.5, height: 19.1 },
};

/** Names of the GS1 Application Identifiers the GS1-128 page's example uses, and a few more. */
export const GS1_AI_NAMES: Record<string, string> = {
  "00": "SSCC: the pallet or shipment",
  "01": "GTIN of the product or case",
  "02": "GTIN of the items inside a logistic unit",
  "10": "Batch or lot number",
  "11": "Production date (YYMMDD)",
  "15": "Best before date (YYMMDD)",
  "17": "Expiry date (YYMMDD)",
  "21": "Serial number",
};

const GS1_NUMBERS =
  "A GTIN is licensed, not bought outright: you join GS1 (or the GS1 organization in your country), get a company prefix and number your products from it. Large retailers and marketplaces check GTINs against GS1's registry, so numbers resold from someone else's prefix can be rejected.";

export const BARCODE_FORMAT_PAGES: readonly BarcodeFormatPage[] = [
  {
    id: "ean13",
    slug: "ean-13",
    title: "Free EAN-13 Barcode Generator",
    metaDescription:
      "Make an EAN-13 barcode for retail products. Type 12 digits and the check digit is added, or 13 to have it checked. SVG, PDF, EPS and PNG. Free, no signup.",
    intro:
      "EAN-13 is the barcode on retail products almost everywhere outside the US and Canada. Type the 12 digits of your number and the generator adds the check digit, or type all 13 and it checks yours, then download the barcode as a vector for print or a PNG for screens.",
    usedFor: [
      "Products sold in shops and online marketplaces. The 13 digits are a GTIN-13: a GS1 company prefix, an item number and a check digit. The first digits show which GS1 organization issued the prefix, not where the product was made.",
      "Books and magazines use it too: an ISBN starting with 978 or 979 is printed as an EAN-13, and 977 marks an ISSN for periodicals. Numbers starting with 2 are kept for in-store use, such as weighed items priced at the counter.",
    ],
    numbers: {
      title: "Do I need GS1 numbers for EAN-13?",
      paragraphs: [
        `For anything sold through a retailer, yes. ${GS1_NUMBERS}`,
        "This generator draws any valid 13-digit number, but it doesn't issue or register numbers. For your own stock, shelves or assets, use Code 128 instead: it needs no registration.",
      ],
    },
    rules: [
      "Spaces and dashes are ignored, and only digits are allowed. Twelve digits get the check digit added; thirteen have the last one checked, and a wrong check digit shows an error instead of a barcode.",
      "The check digit weighs the digits 3, 1, 3, 1… starting from the right of the 12-digit body, adds them up and picks the digit that brings the sum to the next multiple of 10.",
    ],
    sizing: [
      "At 100% an EAN-13 is 37.29 mm wide (quiet zones included) by 25.93 mm high, with a 0.33 mm module. GS1 allows 80% to 200% for retail.",
      "The vector downloads use a 0.353 mm module, about 107%. Scale them within the 80% to 200% range and keep the proportions: shortening the bars makes the barcode harder to scan at checkouts.",
      "Leave 11 modules of blank space on the left and 7 on the right. The generator starts with 11 on both sides.",
    ],
    faqs: [
      {
        question: "Can I make up an EAN-13 number?",
        answer:
          "It will scan, but a store's system won't recognize it and may already use that number for another product. Retail EAN-13 numbers come from a GS1 company prefix. Numbers starting with 2 are the exception: they're meant for use inside one store or company.",
      },
      {
        question: "What's the difference between EAN-13 and UPC-A?",
        answer:
          "A UPC-A is a 12-digit number that equals an EAN-13 starting with 0, and checkout scanners read both. US and Canadian retailers often ask for UPC-A; elsewhere EAN-13 is the norm.",
      },
      {
        question: "Can I make an ISBN barcode?",
        answer:
          "Yes, with the ISBN barcode type: it's an EAN-13 of the ISBN-13 with the hyphenated ISBN printed above the bars, and it takes an ISBN-10 and a 5-digit price add-on too. ISSN (magazines) and ISMN (printed music) have their own types.",
      },
      {
        question: "Why does my 13-digit number show an error?",
        answer:
          "Its last digit isn't the check digit the other 12 produce, which usually means a typo. The error says what the check digit should be. Enter only the first 12 digits to have it worked out.",
      },
    ],
  },
  {
    id: "upca",
    slug: "upc-a",
    title: "Free UPC-A Barcode Generator",
    metaDescription:
      "Make a UPC-A barcode for products sold in the US and Canada. Type 11 digits and the check digit is added, or 12 to have it checked. SVG, PDF, EPS and PNG.",
    intro:
      "UPC-A is the 12-digit retail barcode of the US and Canada. Type the first 11 digits and the generator adds the check digit, or type all 12 to have it checked, then download a vector for your packaging or a PNG for an online listing.",
    usedFor: [
      "Products sold in US and Canadian stores and on marketplaces that ask for a UPC. The number is a GTIN-12: a GS1 company prefix, an item number and a check digit.",
      "The first digit says what kind of number it is: 2 is kept for weighed items priced in the store, and 3 for medicines that carry a US National Drug Code. Since 2005, checkout systems in the US and Canada read EAN-13 too, but many retailers still ask for UPC-A.",
    ],
    numbers: {
      title: "Do I need GS1 numbers for UPC-A?",
      paragraphs: [
        `For retail, yes. ${GS1_NUMBERS} In the US, that's GS1 US.`,
        "This generator draws any valid number; it doesn't issue or register them.",
      ],
    },
    rules: [
      "Digits only; spaces and dashes are ignored. Eleven digits get the check digit added, twelve have it checked.",
      "The check digit triples the digits in odd positions (1st, 3rd, 5th… of the 11), adds the rest and picks the digit that brings the total to the next multiple of 10. It's the same rule as EAN-13, so a UPC-A with a 0 in front is a valid EAN-13.",
    ],
    sizing: [
      "At 100% a UPC-A is 37.29 mm wide with its quiet zones and a 0.33 mm module; GS1 allows 80% to 200%.",
      "The vector downloads use a 0.353 mm module, about 107%. Keep the proportions when you scale, and don't shorten the bars to fit a small pack: use UPC-E if the product qualifies.",
      "Keep at least 9 modules clear on each side. The generator starts with 11.",
    ],
    faqs: [
      {
        question: "Is a UPC the same as a GTIN?",
        answer:
          "The number in a UPC-A barcode is a GTIN-12. Written with two leading zeros it's the GTIN-14 that some product feeds ask for.",
      },
      {
        question: "My scanner reads 13 digits from a UPC-A. Is that wrong?",
        answer:
          "No. Many readers report a UPC-A as the 13-digit EAN with a 0 in front. The scan check on this page accepts both.",
      },
      {
        question: "Can I turn my UPC-A into a smaller UPC-E?",
        answer:
          "Only if the number has zeros in the right places. Open the UPC-E generator and enter the 12-digit UPC-A: it tells you whether yours can be shortened.",
      },
    ],
  },
  {
    id: "code128",
    slug: "code-128",
    title: "Free Code 128 Barcode Generator",
    metaDescription:
      "Make a Code 128 barcode for labels, asset tags and tickets: letters, digits and symbols, up to 80 characters. Scan-checked in the browser. SVG, PDF, PNG.",
    intro:
      "Code 128 is the general-purpose barcode: letters, digits, spaces and keyboard symbols in a compact row of bars. Type your text, check that it scans and download it for labels, asset tags, tickets or stock bins. It needs no registration.",
    usedFor: [
      "Inventory and stock labels, asset tags, library and lab samples, tickets, internal shipping labels and order numbers: anything that needs a barcode but isn't a product sold in shops.",
      "It's the barcode most warehouse and point-of-sale scanners read out of the box, and the base of GS1-128, which adds Application Identifiers for supply chain data.",
    ],
    numbers: {
      title: "Do I need to register a Code 128 barcode?",
      paragraphs: [
        "No. Code 128 holds whatever text you choose, so there's no number to license. Use your own SKUs, serial numbers or IDs.",
        "If a retailer or logistics partner asks for GS1 data (a GTIN, SSCC, batch or expiry date), use GS1-128 instead: it's Code 128 with GS1's structure.",
      ],
    },
    rules: [
      "Up to 80 characters of plain ASCII: letters, digits, spaces and the symbols on a US keyboard. Accented letters, emoji and control characters can't be encoded here.",
      "Code 128 adds its own check character (a sum modulo 103) and three code sets: set C packs two digits into each character, so long runs of digits make shorter barcodes. The encoder picks the code sets for you, and readers don't print the check character.",
    ],
    sizing: [
      "Each Code 128 character is 11 modules wide, plus start, check and stop characters and 10 modules of quiet zone each side. With the downloads' 0.353 mm module, ABCDEFGHIJ is 58.2 mm wide and 1234567890 is 38.8 mm: the digits pair up.",
      "A common rule for handheld scanners is bars at least 15% of the barcode's length, or 6.35 mm (a quarter inch), whichever is more. The default bar height is 15 mm.",
      "There's no fixed size: shrink the module for small labels, but test with the scanners that will read it, especially on thermal label printers.",
    ],
    faqs: [
      {
        question: "Can Code 128 hold lowercase letters?",
        answer:
          "Yes. Unlike Code 39, it encodes upper and lower case, digits and symbols.",
      },
      {
        question: "Why is my barcode so long?",
        answer:
          "Long text makes long barcodes: each letter adds 11 modules. Shorten the text, use digits where you can (they pair up), or use a 2D code such as Data Matrix, which holds far more in a small square.",
      },
      {
        question: "Is Code 128 the same as GS1-128?",
        answer:
          "GS1-128 is Code 128 with a special first character (FNC1) and GS1 Application Identifiers. A plain Code 128 with GS1-looking text isn't a GS1-128, and GS1 systems won't treat it as one.",
      },
    ],
  },
  {
    id: "itf14",
    slug: "itf-14",
    title: "Free ITF-14 Barcode Generator for Cartons",
    metaDescription:
      "Make an ITF-14 barcode for shipping cartons: 13 digits get the check digit, 14 are checked. Bearer bars included. SVG, PDF and EPS for print. Free.",
    intro:
      "ITF-14 is the barcode printed on corrugated cartons that hold retail products. It carries the 14-digit GTIN of the case. Type 13 digits and the check digit is added, or all 14 to have it checked, and download a vector with its bearer bars for your carton artwork.",
    usedFor: [
      "Outer cases and shipping cartons scanned in warehouses and distribution centers, not at the checkout. The thick frame around the bars (bearer bars) evens out printing pressure on rough board and stops a scanner reading only part of the barcode.",
      "The first digit is the indicator, 1 to 8, which tells packaging levels apart (a case of 6, a case of 24). The next 12 digits are the GTIN of the item inside without its check digit, and a new check digit closes the number.",
    ],
    numbers: {
      title: "Where does an ITF-14 number come from?",
      paragraphs: [
        "From the GTIN of the product inside. Take its 12-digit body (an EAN-13 without the check digit, or a UPC-A with a 0 in front), put an indicator digit before it and let the generator add the new check digit.",
        `So you need GS1 numbers for the product itself first. ${GS1_NUMBERS}`,
      ],
    },
    rules: [
      "Digits only; spaces and dashes are ignored. Thirteen digits get the check digit added, fourteen have it checked.",
      "The check digit uses the same 3, 1, 3, 1… weights from the right as EAN-13, over 13 digits.",
    ],
    sizing: [
      "GS1 sizes ITF-14 for cartons: a module of 0.495 mm to 1.016 mm (1.016 mm is 100%) and bars at least 32 mm high, with 10 modules of quiet zone each side.",
      "The downloads use a 0.353 mm module and 25 mm bars, smaller than GS1's minimum for cartons. Enlarge the file to 141% in your artwork: the module becomes 0.495 mm and the bars 35 mm.",
      "Printed straight onto brown board, bigger is safer: check the size with your packaging printer.",
    ],
    faqs: [
      {
        question: "Can I put an ITF-14 on a retail product?",
        answer:
          "No, it's for cases and cartons. The consumer unit inside carries its own EAN-13 or UPC-A for the checkout.",
      },
      {
        question: "What indicator digit should I use?",
        answer:
          "Any of 1 to 8, chosen by you, one per packaging configuration: for example 1 for a case of 6 and 2 for a case of 24. 9 is kept for items with variable quantity.",
      },
      {
        question: "Can I turn the bearer bars off?",
        answer:
          "Not here: the generator always draws the full frame, which GS1 recommends when ITF-14 is printed directly onto corrugated board.",
      },
    ],
  },
  {
    id: "gs1-128",
    slug: "gs1-128",
    title: "Free GS1-128 Barcode Generator (SSCC, Batch, Expiry)",
    metaDescription:
      "Make GS1-128 barcodes for logistics labels: GTIN, SSCC, batch, expiry and weight in one barcode. Check digits and dates checked. SVG, PDF and EPS. Free.",
    intro:
      "GS1-128 puts several pieces of supply chain data into one barcode, each marked by an Application Identifier (AI) in brackets: (01) for the GTIN, (17) for the expiry date, (10) for the batch, (00) for a pallet's SSCC. Type the AIs and values; check digits are added or checked for you.",
    usedFor: [
      "Logistics labels on cases and pallets, and labels on fresh food, meat and medical supplies where a batch, an expiry date or a weight must travel with the GTIN.",
      "The GS1 logistic label carries the pallet's SSCC, AI (00), as a GS1-128. Retail and logistics partners usually specify which AIs they want on it.",
    ],
    numbers: {
      title: "Do I need GS1 numbers for GS1-128?",
      paragraphs: [
        "For the GTIN in (01) and the SSCC in (00), yes: both are built from a GS1 company prefix. Batch numbers, dates and weights are your own data.",
        GS1_NUMBERS,
      ],
    },
    rules: [
      "Write each AI in brackets followed by its value: (01)09501101530003(17)261231(10)AB-123. The brackets aren't encoded; they show where each field starts.",
      "GTINs in (01) and (02) and SSCCs in (00) get their check digit added when you leave it off, or checked when you don't. The encoder also checks every value against GS1's rules: an unknown AI or an impossible date such as month 13 is refused.",
      "A GS1-128 holds up to 48 characters of AIs and data. Put variable-length fields such as (10) batch last, so no separator is needed after them.",
    ],
    sizing: [
      "On GS1 logistic labels, GS1 asks for a module of 0.495 mm to 0.94 mm (0.495 mm is the target), bars at least 31.75 mm high and a barcode no longer than 165 mm with its quiet zones.",
      "The downloads use a 0.353 mm module and 15 mm bars, which suits small item labels. For a pallet or case label, set the bar height to 23 mm and enlarge the file to 141%: the module becomes 0.495 mm and the bars 32.4 mm. The example is then 142 mm long.",
      "Long data makes long barcodes: if it won't fit in 165 mm, split it over two GS1-128 barcodes, as GS1 logistic labels do.",
    ],
    faqs: [
      {
        question: "What do (17) and (15) dates look like?",
        answer:
          "Six digits, YYMMDD: (17)261231 is an expiry of 31 December 2026. A day of 00 means the end of that month.",
      },
      {
        question: "Can I add a serial number?",
        answer:
          "Yes, with AI (21), up to 20 characters. Put it last, or after other fixed-length fields, to keep the barcode short.",
      },
      {
        question: "Why does my scanner show no brackets?",
        answer:
          "The brackets are only for people. Readers report the data with a symbology identifier (]C1) or none, and separate variable-length fields with an invisible GS character. The scan check here accepts all of these forms.",
      },
    ],
  },
  {
    id: "gs1-databar",
    slug: "gs1-databar",
    title: "Free GS1 DataBar Barcode Generator (Omnidirectional)",
    metaDescription:
      "Make a GS1 DataBar Omnidirectional barcode from a GTIN, with the check digit added or checked. Scan-checked in your browser. SVG, PDF, EPS and PNG. Free.",
    intro:
      "GS1 DataBar Omnidirectional holds one thing: a product's 14-digit GTIN, the number an EAN-13 or UPC-A carries. Type it after (01), check that it scans and download it.",
    usedFor: [
      "Retail items too small for an EAN-13 or UPC-A: its bars are as wide as an EAN-13's but much shorter. Checkout scanners read it from any angle, like an EAN-13.",
      "Not every scanner has GS1 DataBar switched on. Ask the retailer that will scan it before you print, and use EAN-13 or UPC-A when in doubt.",
    ],
    numbers: {
      title: "Do I need GS1 numbers for GS1 DataBar?",
      paragraphs: [
        "Yes. The GTIN it holds is built from a GS1 company prefix, like the number in an EAN-13 or UPC-A.",
        GS1_NUMBERS,
      ],
    },
    rules: [
      "Write the GTIN after (01), as 14 digits: (01)09501101530003. A 13-digit EAN-13 number becomes a GTIN with a 0 in front, and a 12-digit UPC-A number with two.",
      "Leave off the last digit and the check digit is added; enter all 14 and it's checked. The brackets aren't encoded; they show that (01), the GTIN, follows.",
      "GS1 DataBar holds nothing but the GTIN. For a weight, a price, a batch or a date, use GS1 DataBar Expanded, which takes the same (AI)value input.",
    ],
    sizing: [
      "The downloads use a 0.353 mm module and 15 mm bars. GS1 asks for bars at least 33 modules high, 11.6 mm at this module.",
      "The bars are 96 modules wide, 33.5 mm here: about the width of an EAN-13's bars at the same module. The printed GTIN is a little wider than the bars, so the file is wider too.",
    ],
    faqs: [
      {
        question: "What does a scanner return?",
        answer:
          "The digits 01 and the GTIN, 16 in all, sometimes after a symbology identifier (]e0), and with no brackets. The scan check here accepts both forms.",
      },
      {
        question: "My scanner reads EAN-13 but not this. Why?",
        answer:
          "Most likely GS1 DataBar is switched off in its settings. Many scanners let you turn each symbology on or off; check the manual for GS1 DataBar, which older documents call RSS-14.",
      },
      {
        question: "Can it hold a weight or an expiry date?",
        answer:
          "No, only the GTIN. GS1 DataBar Expanded holds the GTIN with other Application Identifiers, such as (3103) for a weight or (17) for an expiry date.",
      },
    ],
  },
  {
    id: "gs1-databar-expanded",
    slug: "gs1-databar-expanded",
    title: "Free GS1 DataBar Expanded Barcode Generator",
    metaDescription:
      "Make a GS1 DataBar Expanded barcode: a GTIN with weight, price, batch or expiry in one retail barcode. Check digits added. Scan-checked. SVG, PDF, PNG.",
    intro:
      "GS1 DataBar Expanded carries a GTIN and more data in one barcode a checkout scanner reads, each piece marked by an Application Identifier (AI) in brackets: (01) for the GTIN, (17) for an expiry date, (10) for a batch. Type the AIs and values; check digits are added or checked for you.",
    usedFor: [
      "Fresh food sold by weight, such as meat, cheese and deli counters, where the weight or the price travels with the GTIN so the checkout can read it from the barcode.",
      "North American coupons use its stacked form, GS1 DataBar Expanded Stacked, which this generator doesn't draw.",
    ],
    numbers: {
      title: "Do I need GS1 numbers for GS1 DataBar Expanded?",
      paragraphs: [
        "For the GTIN in (01), yes: it's built from a GS1 company prefix. Weights, prices, batches and dates are your own data.",
        GS1_NUMBERS,
      ],
    },
    rules: [
      "Write each AI in brackets followed by its value: (01)09501101530003(17)261231(10)AB-123. The brackets aren't encoded; they show where each field starts.",
      "GTINs in (01) and (02) and SSCCs in (00) get their check digit added when you leave it off, or checked when you don't. The encoder also checks the data against GS1's rules: a batch (10) without a GTIN, for example, is refused.",
      "It holds up to 74 digits of AIs and data, and fewer when there are letters. Put variable-length fields such as (10) batch last, so no separator is needed after them.",
    ],
    sizing: [
      "The downloads use a 0.353 mm module and 15 mm bars. GS1 asks for bars at least 34 modules high, 12 mm at this module.",
      "It's long, not tall: the example's bars are 98.8 mm long, a little more than the same data as GS1-128 (93.8 mm). More data makes it longer still.",
    ],
    faqs: [
      {
        question: "Why does my scanner show no brackets?",
        answer:
          "The brackets are only for people. Readers report the data with a symbology identifier (]e0) or none, and separate variable-length fields with an invisible GS character. The scan check here accepts all of these forms.",
      },
      {
        question: "GS1 DataBar Expanded or GS1-128?",
        answer:
          "Use the one your retailer or trading partner asks for. GS1 DataBar Expanded is the retail one, read at the checkout on items such as fresh food; GS1-128 is the logistics barcode on cases, pallets and shipping labels.",
      },
    ],
  },
  {
    id: "intelligent-mail",
    slug: "intelligent-mail",
    title: "Free USPS Intelligent Mail Barcode Generator (IMb)",
    metaDescription:
      "Make a USPS Intelligent Mail barcode (IMb) from its 20-digit tracking code and ZIP Code, drawn to the USPS-B-3200 sizes. SVG, PDF, EPS and PNG. Free.",
    intro:
      "The Intelligent Mail barcode (IMb) is the row of 65 short and tall bars on US letters and flats. It holds a 20-digit tracking code and the delivery ZIP Code, and USPS sorting machines read it to route and track each piece. Type the digits and download it, drawn to the sizes in the USPS specification, USPS-B-3200.",
    usedFor: [
      "Letters, postcards and flats mailed in the US. Mailers print it in the address block to get automation prices, and with a serial number of its own on each piece, to see where their mail is in the USPS network.",
      "Parcels use a different barcode, the Intelligent Mail package barcode (IMpb).",
      "The scan check on this page can't read Intelligent Mail: the reader it uses doesn't decode it, so the generator says the barcode wasn't checked. Test a printed piece with a reader that supports Intelligent Mail before a mailing.",
    ],
    numbers: {
      title: "Where do the numbers come from?",
      paragraphs: [
        "From USPS and from you. USPS assigns the mailer ID (request one in its Business Customer Gateway), the barcode ID, which marks the presort level, and the service type ID, which names the mail class and services such as address correction. Its tables of valid IDs are on PostalPro.",
        "The serial number is yours: give each mailpiece its own, so its scans can be told apart. The routing code is the delivery ZIP Code: 5 digits, ZIP+4 (9) or ZIP+4 and the 2-digit delivery point (11), keeping leading zeros: 02768, not 2768.",
      ],
    },
    rules: [
      "Type the 20-digit tracking code, then the routing code: 20, 25, 29 or 31 digits in all. Spaces and hyphens are ignored, so you can write it the way it's printed.",
      "The tracking code is the barcode ID (2 digits, the second 0 to 4), the service type ID (3), then the mailer ID and serial number (15). A mailer ID starting with 9 has 9 digits and leaves 6 for the serial; any other has 6 and leaves 9. The line under the field shows how your digits were split.",
      "There's no check digit to type: the barcode carries its own 11-bit error check, worked out from the digits. Tests here draw the four worked examples in USPS-B-3200 and compare all 65 bars of each.",
    ],
    sizing: [
      "The bars follow USPS-B-3200: 0.02 in (0.51 mm) wide, about 22 to the inch, and the full bars 0.156 in (3.96 mm) tall, inside the 0.125 to 0.165 in USPS allows. The bar height has no slider for this reason. Print the SVG, PDF or EPS at 100%.",
      "USPS asks for 0.125 in (3.2 mm) clear on each side and 0.028 in above and below. The quiet zone starts at 7 bar widths (0.14 in) each side, and the image keeps 0.042 in above and below.",
      "Image size starts at 2×: at 1× the bars round to whole pixels that are wider than USPS allows.",
    ],
    faqs: [
      {
        question: "Can this page check that it scans?",
        answer:
          "No. The scan check uses ZXing, which doesn't read Intelligent Mail, so it says the barcode wasn't checked instead of guessing. The encoding is tested against the specification's worked examples, but test a printed piece with a reader that supports Intelligent Mail before a mailing.",
      },
      {
        question: "Should I print the digits?",
        answer:
          "Some USPS services require the digits printed with the barcode; most mail doesn't. When they're printed, USPS-B-3200 wants each field separated by a space, in a 10- to 12-point sans serif starting at the first bar, 0.028 to 0.5 in from the bars. The generator prints them that way, 10-point, under the bars; turn them off with the switch under the colors.",
      },
      {
        question: "Where does it go on the envelope?",
        answer:
          "Usually in the address block, above the name or below the city line. USPS Publication 25 and the Domestic Mail Manual set the exact areas, and the clear space each side.",
      },
      {
        question: "Does it replace POSTNET?",
        answer:
          "Yes. Intelligent Mail carries the ZIP Code the old POSTNET barcode did, plus the tracking code, and USPS no longer gives automation prices for POSTNET.",
      },
    ],
  },
  {
    id: "datamatrix",
    slug: "data-matrix",
    title: "Free Data Matrix Code Generator",
    metaDescription:
      "Make a Data Matrix code for part marking, small labels and serial numbers. Any text up to 1,000 characters, scan-checked in your browser. SVG, PDF and PNG.",
    intro:
      "Data Matrix is a small square 2D code that holds a lot of data in very little space. Type any text, up to 1,000 characters here, check that it scans and download it for parts, electronics, small labels and lab samples.",
    usedFor: [
      "Marking parts and electronics, sometimes etched straight onto metal, because a Data Matrix stays readable when part of it is damaged. Also small labels, lab tubes, documents and mail.",
      "Readers need a camera (an image-based scanner or a phone app), not a laser scanner. Many warehouse scanners read it, but some phone camera apps only read QR codes.",
    ],
    numbers: {
      title: "Plain Data Matrix or GS1 DataMatrix?",
      paragraphs: [
        "This page makes plain Data Matrix (ECC 200): it holds whatever text you type, with no registration.",
        "GS1 DataMatrix, required on some medicines and regulated packaging, adds a special first character and GS1 Application Identifiers. It isn't offered here; use GS1-128 if you need GS1 data in a barcode from this generator.",
      ],
    },
    rules: [
      "Any text, up to 1,000 characters here. The code grows in steps as you add text, from 10 × 10 cells upwards; this generator draws the square form.",
      "The largest square Data Matrix (144 × 144 cells) holds 3,116 digits, 2,335 letters and digits, or 1,556 bytes. Digits pack most tightly.",
    ],
    sizing: [
      "The vector downloads draw each cell 0.71 mm square, so SN-0042-7781 comes out 12.7 mm across with its margin. Scale it down in your layout for small labels.",
      "The smallest cell a scanner reads depends on the scanner and the print, so test at the size you'll use.",
      "Data Matrix needs only a 1-cell margin; the generator starts with 2.",
    ],
    faqs: [
      {
        question: "Can a phone read a Data Matrix?",
        answer:
          "Many barcode scanner apps can. Some phone camera apps only open QR codes, so if people scan with their phones, a QR code is the safer choice.",
      },
      {
        question: "Data Matrix or QR code?",
        answer:
          "For links people scan with a phone, QR. For small parts and industrial labels read by scanners, Data Matrix: it's more compact for short serial numbers and is the norm in electronics and part marking.",
      },
      {
        question: "Does it have error correction?",
        answer:
          "Yes. ECC 200 Data Matrix always includes Reed–Solomon error correction, so a scuffed or partly covered code can still be read.",
      },
    ],
  },
  {
    id: "ean8",
    slug: "ean-8",
    title: "Free EAN-8 Barcode Generator",
    metaDescription:
      "Make an EAN-8 barcode for packs too small for an EAN-13. Type 7 digits and the check digit is added, or 8 to have it checked. SVG, PDF, EPS and PNG.",
    intro:
      "EAN-8 is the short retail barcode for packs too small to fit an EAN-13, such as a lipstick or a pack of gum. Type 7 digits and the check digit is added, or all 8 to have it checked.",
    usedFor: [
      "Small retail items where an EAN-13 would cover too much of the pack. Checkout scanners read it like any EAN.",
      "EAN-8 numbers starting with 0 or 2 are kept for use inside a store or company, like EAN-13 numbers starting with 2.",
    ],
    numbers: {
      title: "Where do EAN-8 numbers come from?",
      paragraphs: [
        "From GS1, one at a time: GS1 organizations issue EAN-8 numbers (GTIN-8) individually, only for products that are too small for an EAN-13. You can't shorten an EAN-13 into one.",
        "Ask your GS1 organization whether your product qualifies; often a smaller EAN-13 at 80% fits.",
      ],
    },
    rules: [
      "Digits only. Seven digits get the check digit added, eight have it checked.",
      "The check digit weighs the 7 digits 3, 1, 3… from the right, as in every GS1 number.",
    ],
    sizing: [
      "At 100% an EAN-8 is 26.73 mm wide with its quiet zones, with a 0.33 mm module; GS1 allows 80% to 200%.",
      "The vector downloads use a 0.353 mm module, about 107%, with 7 modules of quiet zone each side, the minimum.",
    ],
    faqs: [
      {
        question: "Can I use an EAN-8 instead of an EAN-13 to save space?",
        answer:
          "Only with an EAN-8 number from GS1. Check first whether an EAN-13 at 80% fits your pack: it's only 29.83 mm wide.",
      },
      {
        question: "Is EAN-8 the same as UPC-E?",
        answer:
          "No. Both are short retail barcodes, but a UPC-E is a shortened UPC-A number, while an EAN-8 is a separate 8-digit number issued by GS1.",
      },
    ],
  },
  {
    id: "upce",
    slug: "upc-e",
    title: "Free UPC-E Barcode Generator",
    metaDescription:
      "Make a UPC-E barcode, the short UPC for small packs. Enter 6 to 8 digits, or a 12-digit UPC-A and see whether it can be shortened. SVG, PDF and PNG. Free.",
    intro:
      "UPC-E is a UPC-A number with its zeros squeezed out, for packs too small for a full UPC-A. Enter the 6 to 8 digits of a UPC-E, or paste a 12-digit UPC-A and the generator tells you whether it can be shortened.",
    usedFor: [
      "Small products sold in the US and Canada: cans, candy bars, cosmetics. Its bars take 51 modules, against 95 for a UPC-A.",
      "Scanners expand it back to the full UPC-A, so stores see the same number either way.",
    ],
    numbers: {
      title: "Can my UPC-A be shortened?",
      paragraphs: [
        "Only some can. The number must start with 0 or 1 and have zeros in the right places: a manufacturer number ending in 000, 100 or 200 with an item number of 00000 to 00999, ending in 00 with 00000 to 00099, ending in 0 with 00000 to 00009, or any manufacturer number with an item number of 00005 to 00009.",
        "The number itself comes from GS1, as for any UPC-A; GS1 US can tell you whether a UPC-E fits your prefix.",
      ],
    },
    rules: [
      "Enter 6 digits (number system 0 is assumed), 7 (number system and six digits; the check digit is added) or 8 (with the check digit, which is checked), or an 11- or 12-digit UPC-A to shorten.",
      "The check digit is the check digit of the expanded UPC-A, so the generator expands the number first.",
    ],
    sizing: [
      "UPC-E follows UPC-A's sizes: a 0.33 mm module at 100%, from 80% to 200%. Keep 9 modules clear on each side.",
      "The vector downloads use a 0.353 mm module, about 107%.",
    ],
    faqs: [
      {
        question: "Why does my scanner show 12 digits?",
        answer:
          "Many readers expand a UPC-E to its UPC-A, and some to the 13-digit EAN. The scan check on this page accepts all of them.",
      },
      {
        question: "My UPC-A can't be shortened. What now?",
        answer:
          "Print the UPC-A, at down to 80% if space is tight, or ask GS1 US for a number that has a UPC-E form.",
      },
    ],
  },
  {
    id: "isbn",
    slug: "isbn",
    title: "Free ISBN Barcode Generator with Price Add-on",
    metaDescription:
      "Make an ISBN barcode for a book cover: ISBN-13 or ISBN-10, check digit and hyphens worked out, and an optional price add-on. SVG, PDF and EPS. Free.",
    intro:
      "An ISBN barcode is an EAN-13 of the book's 13-digit ISBN, with the ISBN printed above the bars. Type the ISBN, with or without hyphens, and the generator checks it, places the hyphens and draws the barcode, with a 5-digit price add-on if you sell in the US or Canada.",
    usedFor: [
      "The back cover of books, where bookshops, distributors and libraries scan it to look the book up. The ISBN Users' Manual recommends the lower right of the back cover, near the spine.",
      "Each edition and format of a book has its own ISBN, so a hardback, a paperback and an audiobook each carry a different barcode. ISBNs start with 978 or 979; numbers starting 979-0 are ISMNs, for printed music.",
    ],
    numbers: {
      title: "Where do ISBNs come from?",
      paragraphs: [
        "From the ISBN agency of the country where the publisher is based. Some agencies charge for ISBNs and some give them out free; the International ISBN Agency lists them all.",
        "This generator draws the barcode of an ISBN you already have. It doesn't issue or register ISBNs.",
      ],
    },
    rules: [
      "Type an ISBN-13 or an ISBN-10, with or without hyphens or spaces. Twelve digits get the check digit added and thirteen have it checked. A whole ISBN-10, check digit included, is converted to its ISBN-13: 978 in front of its first nine digits and a new check digit.",
      "The ISBN above the bars is split into its five parts (prefix, registration group, registrant, publication and check digit) by the ranges the International ISBN Agency publishes, because the parts' lengths differ from one country and publisher to the next.",
      "The check digit is the EAN-13 one: the first 12 digits are weighted 1, 3, 1, 3… and the check digit brings their sum to a multiple of 10.",
      "The add-on goes in its own field. In the US and Canada it's 5 digits: the first is the currency (5 for US dollars, 6 for Canadian dollars) and the rest the price, so 52499 is US$24.99, and 90000 means no price. Elsewhere the ISBN Users' Manual keeps 90000 to 98999 for publishers' own use.",
    ],
    sizing: [
      "An ISBN barcode is an EAN-13, so EAN-13 sizes apply: 37.29 mm wide with its quiet zones at 100%, with a 0.33 mm module, and GS1 allows 80% to 200%.",
      "The vector downloads use a 0.353 mm module, about 107%, and put the add-on 9 modules right of the main bars, within the 7 to 12 GS1 allows. Keep the proportions when you scale, and don't cut the bar height.",
      "Keep cover artwork out of the quiet zones and away from the ISBN line above the bars.",
    ],
    faqs: [
      {
        question: "Can I use my old ISBN-10?",
        answer:
          "Yes. Type it and the generator converts it to the ISBN-13 that goes in the barcode: 978, its first nine digits and a new check digit. ISBN agencies have only given out 13-digit ISBNs since 1 January 2007.",
      },
      {
        question: "Do I need the 5-digit price add-on?",
        answer:
          "Only if you sell through the US or Canadian book trade, which uses it for the cover price. Use 90000 if you don't want a price in the barcode. Outside North America, leave it off.",
      },
      {
        question: "Is an ISBN barcode just an EAN-13?",
        answer:
          "The bars are an EAN-13 of the ISBN-13, and checkout scanners read it as one. An ISBN barcode also prints the hyphenated ISBN above the bars, as the ISBN Users' Manual asks, which the EAN-13 generator doesn't.",
      },
      {
        question: "Why are the hyphens different from the ones I typed?",
        answer:
          "Each part of an ISBN has a length set by the International ISBN Agency's ranges, and the generator places the hyphens from them. If your ISBN is in a range newer than the generator's copy, type it with its hyphens and they're printed as you wrote them.",
      },
    ],
  },
  {
    id: "issn",
    slug: "issn",
    title: "Free ISSN Barcode Generator for Magazines",
    metaDescription:
      "Make an ISSN barcode for a magazine or journal: the 977 EAN-13 with its sequence variant and an issue add-on, check digits worked out. SVG, PDF, EPS. Free.",
    intro:
      "An ISSN barcode puts the ISSN of a magazine, journal or newspaper into an EAN-13 starting 977, usually with a 2-digit add-on for the issue number. Type the ISSN and the issue, and the generator works out both check digits and draws the barcode with the ISSN above it.",
    usedFor: [
      "Covers of magazines, journals, newspapers and other serials sold in shops. Retailers and wholesalers scan the main barcode to find the title, and the add-on tells one issue from the next.",
      "A title published both in print and online has a different ISSN for each; the barcode goes on the print edition.",
    ],
    numbers: {
      title: "Where do ISSNs come from?",
      paragraphs: [
        "From the national ISSN centre of the publisher's country, or the ISSN International Centre where there's none. Publishers don't make up ISSNs themselves.",
        "This generator draws the barcode of an ISSN you already have; it doesn't issue or register ISSNs. Distributors may have their own rules for the variant and add-on digits, so check with yours.",
      ],
    },
    rules: [
      "Type the 8-character ISSN, NNNN-NNNC, or its first 7 digits to have the check digit added. An ISSN's check digit is weighted 8 down to 2, modulo 11, so it can be X.",
      "The barcode holds 977, the ISSN's first 7 digits (its check digit is left out), the 2-digit sequence variant and an EAN-13 check digit. The variant is 00 unless you change it: publishers use it for extra information such as a change of price.",
      "The add-on is usually the issue number in 2 digits; 5 digits work too. You can also type the 13-digit 977 number from an existing barcode, and the ISSN and variant are read from it.",
    ],
    sizing: [
      "An ISSN barcode is an EAN-13, so EAN-13 sizes apply: 37.29 mm wide with its quiet zones at 100%, with a 0.33 mm module, and GS1 allows 80% to 200%.",
      "The vector downloads use a 0.353 mm module, about 107%, and put the add-on 9 modules right of the main bars, within the 7 to 12 GS1 allows. Keep the proportions when you scale, and don't cut the bar height.",
    ],
    faqs: [
      {
        question: "What should the 2-digit add-on be?",
        answer:
          "Usually the issue number, counted the way your distributor asks: a weekly title and a monthly title number their issues differently. A new issue only needs a new add-on, not a new ISSN.",
      },
      {
        question: "When do I change the sequence variant?",
        answer:
          "When an issue needs a different main barcode, for example for a different cover price. Most titles keep 00.",
      },
      {
        question: "Is an ISSN barcode an EAN-13?",
        answer:
          "Yes, one starting 977, and checkout scanners read it as one. The add-on is a small separate barcode to its right; scanners set up to read add-ons report it after the 13 digits.",
      },
    ],
  },
  {
    id: "ismn",
    slug: "ismn",
    title: "Free ISMN Barcode Generator for Printed Music",
    metaDescription:
      "Make an ISMN barcode for sheet music and scores: 979-0 ISMNs or old M- numbers, check digit and hyphens worked out. SVG, PDF and EPS for print. Free.",
    intro:
      "An ISMN identifies a publication of notated music, such as a score, a set of parts or a songbook, and is printed as an EAN-13 starting 979-0 with the ISMN above the bars. Type the ISMN, or an old number starting with M, and download the barcode for your cover.",
    usedFor: [
      "Printed and digital sheet music: scores, parts, songbooks and other notated music, scanned by music shops, distributors and libraries. Each part sold on its own has its own ISMN.",
      "Books about music get an ISBN instead, and sound recordings have identifiers of their own. A songbook can have both an ISMN and an ISBN.",
    ],
    numbers: {
      title: "Where do ISMNs come from?",
      paragraphs: [
        "From the ISMN agency of the publisher's country, appointed by the International ISMN Agency. A publisher gets a registrant number and usually numbers its publications from it.",
        "This generator draws the barcode of an ISMN you already have. It doesn't issue or register ISMNs.",
      ],
    },
    rules: [
      "Type the 13 digits starting 979-0, with or without hyphens, or 12 to have the check digit added. An old 10-character ISMN starting with M is converted: the M becomes 979-0 and the check digit stays the same.",
      "The ISMN above the bars is split into prefix, registrant, item and check digit. The registrant's length comes from its first digit, as the ISMN Users' Manual sets out: 000 to 099, 1000 to 3999, 40000 to 69999, 700000 to 899999, then 9000000 to 9999999.",
      "The check digit is the EAN-13 one: the first 12 digits are weighted 1, 3, 1, 3… and the check digit brings their sum to a multiple of 10.",
    ],
    sizing: [
      "An ISMN barcode is an EAN-13, so EAN-13 sizes apply: 37.29 mm wide with its quiet zones at 100%, with a 0.33 mm module, and GS1 allows 80% to 200%.",
      "The vector downloads use a 0.353 mm module, about 107%. Keep the proportions when you scale, and don't cut the bar height.",
    ],
    faqs: [
      {
        question: "Can I use an old ISMN starting with M?",
        answer:
          "Yes. Type it and the generator converts it: M-2306-7118-7 becomes 979-0-2306-7118-7, with the same check digit. ISMNs have been 13 digits since 2008.",
      },
      {
        question: "ISMN or ISBN for a songbook?",
        answer:
          "It can have both, and the ISMN Users' Manual leaves the choice to the publisher when only one is used. Books about music, with no notated music as their content, take an ISBN.",
      },
      {
        question: "Can I add a price add-on?",
        answer:
          "Yes, 2 or 5 digits, in the add-on field. The ISMN Users' Manual doesn't ask for one, so add it only if your distributor does.",
      },
    ],
  },
  {
    id: "code39",
    slug: "code-39",
    title: "Free Code 39 Barcode Generator",
    metaDescription:
      "Make a Code 39 barcode with capital letters, digits and - . $ / + %, up to 40 characters, for systems that require it. Scan-checked. SVG, PDF, PNG. Free.",
    intro:
      "Code 39 is an older barcode for capital letters, digits and a few symbols. Nearly every scanner reads it, and some industries and older systems still require it. Type up to 40 characters, check that it scans and download it.",
    usedFor: [
      "Labels in systems that specify it: older automotive and defence labels (LOGMARS), ID badges and legacy inventory systems.",
      "If nothing requires Code 39, use Code 128: it holds lowercase letters and makes a shorter barcode for the same text.",
    ],
    numbers: {
      title: "Do I need to register a Code 39 barcode?",
      paragraphs: [
        "No. Code 39 carries your own text: serial numbers, part numbers, IDs. There's nothing to license.",
      ],
    },
    rules: [
      "Capital letters A to Z, digits, spaces and - . $ / + %, up to 40 characters. Lowercase letters show an error: use capitals, or Code 128 for mixed case.",
      "Each code is wrapped in start and stop asterisks, which aren't typed or decoded. This generator adds no optional check character, which suits most systems; if yours requires a modulo 43 check, add it to your text yourself.",
    ],
    sizing: [
      "Each Code 39 character is 13 to 16 modules wide, against Code 128's 11, so the same text makes a wider barcode: ABCDEFGHIJ is 74.4 mm in the downloads, 58.2 mm as Code 128.",
      "Keep 10 modules of blank space each side, and make the bars at least 15% of the length, or 6.35 mm, so they're easy to sweep.",
    ],
    faqs: [
      {
        question: "Can Code 39 do lowercase?",
        answer:
          "Only in an extended mode (Full ASCII) that pairs characters, which this generator doesn't offer. Use Code 128 for lowercase.",
      },
      {
        question: "Should I type the asterisks?",
        answer:
          "No. The start and stop characters are added for you, and the asterisk can't be part of the text.",
      },
    ],
  },
  {
    id: "code93",
    slug: "code-93",
    title: "Free Code 93 Barcode Generator",
    metaDescription:
      "Make a Code 93 barcode with capital letters, digits and - . $ / + %, up to 40 characters. Check characters added. Scan-checked. SVG, PDF, PNG. Free.",
    intro:
      "Code 93 holds the same characters as Code 39, capital letters, digits and a few symbols, in a shorter barcode with two built-in check characters. Type up to 40 characters, check that it scans and download it.",
    usedFor: [
      "Labels in logistics and inventory systems that specify Code 93.",
      "Your own barcode on mail: Canada Post lists Code 93 among the barcodes it accepts next to the address on Personalized Mail.",
      "If nothing requires Code 93, use Code 128: it holds lowercase letters too, and more scanners have it switched on.",
    ],
    numbers: {
      title: "Do I need to register a Code 93 barcode?",
      paragraphs: [
        "No. Code 93 carries your own text: serial numbers, part numbers, IDs. There's nothing to license.",
      ],
    },
    rules: [
      "Capital letters A to Z, digits, spaces and - . $ / + %, up to 40 characters. Lowercase letters show an error: use capitals, or Code 128 for mixed case.",
      "Every Code 93 barcode ends with two check characters, C and K, worked out from the text (modulo 47). They're required, so the generator always adds them, and readers check them and leave them out of what they return. The start and stop characters are added for you too.",
    ],
    sizing: [
      "Each Code 93 character is 9 modules wide, against Code 39's 13 to 16, so the same text makes a shorter barcode: ABCDEFGHIJ is 51.9 mm in the downloads, 74.4 mm as Code 39 and 58.2 mm as Code 128.",
      "Keep 10 modules of blank space each side, and make the bars at least 15% of the length, or 6.35 mm, so they're easy to sweep.",
    ],
    faqs: [
      {
        question: "Can Code 93 do lowercase?",
        answer:
          "Only in an extended mode (Full ASCII) that adds shift characters, which this generator doesn't offer. Use Code 128 for lowercase.",
      },
      {
        question: "Will my scanner read Code 93?",
        answer:
          "Most barcode scanners can, but some handheld scanners let you switch symbologies off, and Code 93 is one that's sometimes off. Scan a test print with the scanners you'll use before printing a batch.",
      },
    ],
  },
  {
    id: "codabar",
    slug: "codabar",
    title: "Free Codabar Barcode Generator",
    metaDescription:
      "Make a Codabar barcode: digits and - $ : / . + between a start and stop letter A to D, up to 40 characters. Scan-checked. SVG, PDF, PNG. Free, no signup.",
    intro:
      "Codabar is an older barcode of digits and a few symbols, framed by a start and a stop letter. Libraries, blood banks and some shipping labels still use it. Type your value, check that it scans and download it.",
    usedFor: [
      "Library and loan systems, blood bank labels and some shipping and lab labels, wherever an existing system or scanner is set up for Codabar.",
      "If nothing asks for Codabar, use Code 128: it holds letters and makes a shorter barcode for the same text.",
    ],
    numbers: {
      title: "Do I need to register a Codabar barcode?",
      paragraphs: [
        "No. Codabar carries your own numbers, such as a membership, item or sample number. There's nothing to license. Check with the system that reads it which start and stop letters it expects.",
      ],
    },
    rules: [
      "Start and end with one of A, B, C or D, with at least one character between them: digits and - $ : / . + only, up to 40 characters in all, for example A40156B.",
      "The start and stop letters are part of what you type and what a scanner reports; some systems use the choice of letter to tell kinds of labels apart. This generator adds no check digit; if your system needs one, add it to your number yourself.",
    ],
    sizing: [
      "Codabar characters aren't all the same width, so the width depends on what you type: the sample A40156B comes out 37.7 × 19.2 mm in the downloads. Digits, - and $ are the narrow ones; : / . + and the start and stop letters take a little more room.",
      "Keep 10 modules of blank space each side, and make the bars tall enough to sweep easily: the generator starts at 15 mm.",
    ],
    faqs: [
      {
        question: "Which start and stop letters should I use?",
        answer:
          "Use the ones your system expects. Some systems use the letters to mark different label types. The letters can differ at each end.",
      },
      {
        question: "Can Codabar hold letters?",
        answer:
          "Only A to D, as start and stop characters. For other letters use Code 128, or Code 39 for capitals.",
      },
    ],
  },
  {
    id: "pdf417",
    slug: "pdf417",
    title: "Free PDF417 Barcode Generator",
    metaDescription:
      "Make a PDF417 barcode, the stacked 2D code on IDs and boarding passes. Any text up to 1,000 characters, scan-checked in your browser. SVG, PDF and PNG.",
    intro:
      "PDF417 is a stacked 2D barcode: rows of small barcodes on top of each other, holding up to about a kilobyte of text. Type your text, check that it scans and download it.",
    usedFor: [
      "Driver's licenses and ID cards (US and Canadian licenses carry one on the back), paper boarding passes, shipping documents and forms that carry their data with them.",
      "Its wide, short shape fits along the edge of a card or a label, where a square code wouldn't.",
    ],
    numbers: {
      title: "Do I need to register a PDF417 barcode?",
      paragraphs: [
        "No. It holds whatever text you type. Formats such as driver's license data follow their own standards for what goes inside; this generator encodes your text as given.",
      ],
    },
    rules: [
      "Any text, up to 1,000 characters here. A PDF417 has 3 to 90 rows of 1 to 30 data columns and can hold up to 1,850 letters and digits, 2,710 digits or 1,108 bytes.",
      "Error correction is built in, so part of the code can be damaged and still read.",
    ],
    sizing: [
      "The vector downloads use a 0.353 mm module: the sample text comes out 43.7 × 8.8 mm. Longer text adds rows and columns.",
      "Keep at least 2 modules of blank space around it; the generator starts there.",
    ],
    faqs: [
      {
        question: "Can phones read PDF417?",
        answer:
          "Many barcode scanner apps can, but the built-in camera apps often don't. It's mostly read by dedicated scanners, such as ID and boarding pass readers.",
      },
      {
        question: "Can I make a driver's license barcode?",
        answer:
          "Only an issuing authority makes real ones. This generator encodes text you type as a PDF417; it doesn't format license data.",
      },
    ],
  },
  {
    id: "aztec",
    slug: "aztec",
    title: "Free Aztec Code Generator",
    metaDescription:
      "Make an Aztec code, the 2D code on rail tickets and mobile boarding passes. No quiet zone needed. Any text up to 1,000 characters. SVG, PDF and PNG. Free.",
    intro:
      "Aztec is a square 2D code that scanners find from the bullseye in its center, so it needs no blank margin around it. Type any text, check that it scans and download it.",
    usedFor: [
      "Transport tickets, both printed at home and shown on phone screens: many European rail operators use it (the UIC 918-3 ticket standard specifies Aztec), and airlines use it on mobile boarding passes.",
      "Because it needs no quiet zone, it fits on tickets and screens where space around the code is tight.",
    ],
    numbers: {
      title: "Do I need to register an Aztec code?",
      paragraphs: [
        "No. It holds whatever text you type. Ticketing standards define their own data inside; this generator encodes your text as given.",
      ],
    },
    rules: [
      "Any text, up to 1,000 characters here. Aztec codes range from 15 × 15 cells (compact) to 151 × 151, holding up to 3,832 digits, 3,067 letters or 1,914 bytes.",
      "Error correction is built in, so a smudged or partly covered code can still be read.",
    ],
    sizing: [
      "The vector downloads draw each cell 0.71 mm square: the sample text comes out 19 mm across with a 2-cell margin. Scale it to suit your ticket or screen.",
      "No quiet zone is required, but a little white space helps scanners on busy designs.",
    ],
    faqs: [
      {
        question: "Aztec or QR code?",
        answer:
          "For links people scan with a phone camera, QR. Aztec is for ticketing and transport systems that ask for it.",
      },
      {
        question: "Can phones read Aztec codes?",
        answer:
          "Many scanner apps and ticket gates can. Some built-in camera apps only open QR codes.",
      },
    ],
  },
  {
    id: "microqr",
    slug: "micro-qr",
    title: "Free Micro QR Code Generator",
    metaDescription:
      "Make a Micro QR code, the smallest QR code, for tiny marks on parts and circuit boards. Up to 35 digits or 15 characters. SVG, PDF and PNG. Free.",
    intro:
      "Micro QR is a smaller QR code with one corner square instead of three, for marks too small for a full QR code. Type a short text, check that it scans and download it.",
    usedFor: [
      "Tiny marks where a regular QR code won't fit: circuit boards, electronic components, small parts and the labels on them.",
      "It's part of the QR code standard, ISO/IEC 18004, from DENSO WAVE, which created the QR code. Most phone camera apps don't read it, so check that the scanners that will read it support it before you print a batch.",
    ],
    numbers: {
      title: "Do I need to register a Micro QR code?",
      paragraphs: [
        "No. It holds whatever text you type, with no registration.",
      ],
    },
    rules: [
      "Any text that fits: up to 35 digits, 21 capital letters (with digits, spaces and $ % * + - . / :) or 15 characters of other text. Accents and other scripts are stored as UTF-8 bytes, 2 or 3 to a character, so less of them fits.",
      "Micro QR comes in four sizes: M1 (11 × 11 modules), M2 (13 × 13), M3 (15 × 15) and M4 (17 × 17). M1 holds digits only and M2 digits and capital letters; other text starts at M3. The generator picks the smallest size your text fits and says which under the field.",
      "M1 only detects errors. The other sizes get error correction level M when there's room for it, or L when the text only fits at L: a reader can recover about 15% of a damaged code at M and 7% at L.",
    ],
    sizing: [
      "The vector downloads draw each module 0.71 mm square: the sample text, an M4, comes out 14.8 × 14.8 mm, quiet zone included. Scale it to the space you have and to what your printer and scanner can resolve.",
      "Micro QR needs 2 modules of blank space all round, half what a QR code needs, which the generator starts with.",
    ],
    faqs: [
      {
        question: "Micro QR or QR code?",
        answer:
          "For anything people scan with their phone, a QR code. Use Micro QR where only a few millimetres fit and you know the scanners that will read it support it.",
      },
      {
        question: "Can this page check that it scans?",
        answer:
          "Yes. As you edit, the generator decodes the image it would download with ZXing, an open-source reader that supports Micro QR, and tells you whether it reads back your text.",
      },
      {
        question: "Can phones read Micro QR codes?",
        answer:
          "Most built-in camera apps can't. The QRdx scanner at /scan reads them in the browser, with the same ZXing reader as the check on this page.",
      },
    ],
  },
  {
    id: "rmqr",
    slug: "rmqr",
    title: "Free rMQR Code Generator (Rectangular Micro QR)",
    metaDescription:
      "Make an rMQR, the rectangular Micro QR code for narrow spaces like cables and test tubes. Up to 361 digits or 150 characters. SVG, PDF and PNG. Free.",
    intro:
      "rMQR (Rectangular Micro QR) is a QR code stretched into a strip, as little as 7 modules tall, for labels too narrow for a square code. Type any text, check that it scans and download it.",
    usedFor: [
      "Narrow labels where a square QR code would have to be tiny: cables and wires, test tubes and sample vials, the edges of parts and boxes.",
      "It's the ISO/IEC 23941 standard (2022), from DENSO WAVE, which also created the QR code. Because it's newer, check that the scanners that will read it support it before you print a batch.",
    ],
    numbers: {
      title: "Do I need to register an rMQR code?",
      paragraphs: [
        "No. It holds whatever text you type, with no registration.",
      ],
    },
    rules: [
      "Any text: letters, digits, symbols, line breaks, accents and other scripts. Digits pack tightest and capital letters next; accents and other scripts are stored as UTF-8 bytes, which take the most room.",
      "rMQR comes in 32 sizes, from 7 to 17 modules tall and 27 to 139 wide. The generator picks the fewest rows your text fits in, then the fewest columns, so the code grows longer before it grows taller.",
      "Error correction is level M, which lets a reader recover about 15% of the code if it's smudged or damaged.",
    ],
    sizing: [
      "The vector downloads draw each module 0.71 mm square: the sample text comes out 44.4 × 7.8 mm, quiet zone included. Scale it to the space you have and to what your printer and scanner can resolve.",
      "rMQR needs 2 modules of blank space all round, which the generator starts with.",
    ],
    faqs: [
      {
        question: "rMQR or QR code?",
        answer:
          "For anything people scan with their phone, a QR code. Use rMQR where only a narrow strip fits and you know the scanners that will read it support it.",
      },
      {
        question: "Can this page check that it scans?",
        answer:
          "Yes. As you edit, the generator decodes the image it would download with ZXing, an open-source reader that supports rMQR, and tells you whether it reads back your text.",
      },
    ],
  },
  {
    id: "maxicode",
    slug: "maxicode",
    title: "Free MaxiCode Generator",
    metaDescription:
      "Make a MaxiCode, the fixed-size 2D code UPS sorts parcels by, as a carrier message (modes 2 and 3) or text (mode 4). SVG, PDF and PNG. Free.",
    intro:
      "MaxiCode is the fixed-size 2D code with a bullseye in the middle that UPS prints on parcel labels, so sorting machines can read where a parcel goes at speed. Type a carrier message or any text, check that it scans and download it.",
    usedFor: [
      "UPS parcel labels: the code carries the destination postcode, country and service class where a sorter expects them, followed by the shipment details.",
      "The layout of a real shipping label and what goes in the rest of the message are set by UPS. Use their label guide for parcels you ship; the example here is a sample, not a shipment.",
    ],
    numbers: {
      title: "Carrier message or text?",
      paragraphs: [
        "A carrier message starts with the postcode, the 3-digit ISO country code (840 for the US) and the 3-digit service class, separated by GS characters. Type them as <GS>: 152382802<GS>840<GS>001<GS>then the rest. A message starting with the [)><RS>01<GS>96 header works too.",
        "An all-digit postcode of up to 9 digits makes it mode 2 (US ZIP Codes); up to 6 capital letters, digits and spaces make it mode 3 (other countries). Anything else is drawn as text, mode 4.",
      ],
    },
    rules: [
      "Latin-1 characters only: letters, digits, symbols and Western European accents.",
      "As text it holds up to 93 capital letters or 138 digits, fewer with lowercase or symbols. A carrier message leaves about 84 characters after the postcode, country and service class.",
      "A 5-digit ZIP Code is drawn with 0000 for the +4, and a mode 3 postcode is padded with spaces to 6 characters; readers return them that way.",
      "Every MaxiCode is the same size: 33 rows of 30 hexagons around the bullseye. More data doesn't make it bigger, so there's a limit instead.",
    ],
    sizing: [
      "The vector downloads are MaxiCode's nominal size, about 28.1 × 26.9 mm without the quiet zone. Print it at that size: readers look for a symbol of that size.",
      "The generator starts with 2 modules of blank space all round; MaxiCode needs at least 1.",
      "Image size starts at 4×: below that, the hexagons are rounded to whole pixels and lose their shape.",
    ],
    faqs: [
      {
        question: "Can this page check that it scans?",
        answer:
          "Yes. As you edit, the generator decodes the image it would download with ZXing, an open-source reader that supports MaxiCode, and tells you whether it reads back your message.",
      },
      {
        question: "Which modes does it make?",
        answer:
          "Modes 2 and 3 for carrier messages and mode 4 for text. Mode 5 (text with stronger error correction) and mode 6 (reader programming) aren't offered.",
      },
      {
        question: "MaxiCode or a QR code?",
        answer:
          "MaxiCode where a carrier's system asks for it, as UPS's does. For anything people scan with a phone, a QR code.",
      },
    ],
  },
  {
    id: "dotcode",
    slug: "dotcode",
    title: "Free DotCode Generator",
    metaDescription:
      "Make a DotCode, the dot-based 2D code printed by high-speed inkjet on tobacco packs and medicines. Up to about 390 letters or 780 digits. SVG, PDF, PNG.",
    intro:
      "DotCode is a 2D code made of separate dots instead of squares, designed for the inkjet and laser printers that mark products on fast production lines. Type any text, up to about 390 letters or 780 digits here, and download it as a vector or an image.",
    usedFor: [
      "Cigarette and tobacco packs sold in the EU: the traceability system of the Tobacco Products Directive accepts DotCode, as well as Data Matrix and QR codes, for the unique identifier on each pack.",
      "Medicines, drinks and other goods coded on the line. The dots don't have to touch, so a fast inkjet printer can mark each item as it passes, on cartons, cans or labels.",
      "Readers need a camera-based scanner with DotCode switched on; many phone apps and older scanners don't read it. The scan check on this page can't read it either, so it says the code wasn't checked: test a print with a reader that supports DotCode.",
    ],
    numbers: {
      title: "Plain DotCode or GS1 DotCode?",
      paragraphs: [
        "This page makes plain DotCode: it holds whatever text you type, with no registration.",
        "GS1 DotCode, which carries GS1 Application Identifiers after a special first character, isn't offered here. For GS1 data in a barcode from this generator, use GS1-128.",
      ],
    },
    rules: [
      "Any text: letters, digits, symbols, line breaks, accents and other scripts. Accents and other scripts are stored as UTF-8 bytes, which take more room, and some readers show them wrongly.",
      "A DotCode here holds up to about 390 letters or 780 digits. Larger ones were tested with an outside DotCode reader, which didn't read them, so the generator stops there.",
      "Text that starts with two digits gets a marker in front saying it isn't GS1 data, as the DotCode specification asks; some readers show that marker as an invisible character before the text.",
      "The code grows as you add text, keeping a wide rectangle. Dots sit on every other square of a checkerboard grid, so no two dots touch.",
    ],
    sizing: [
      "The vector downloads use a 0.71 mm module: each dot is that wide, on a grid of that pitch. Scale it to the dot size of the printer that will mark it.",
      "DotCode needs 3 modules of blank space all round, which the generator starts with.",
      "Image size starts at 2×: at 1× each dot is 2 pixels across, which the outside reader it was tested with didn't read.",
      "Test with the reader that will read it, at the size and on the material you'll print.",
    ],
    faqs: [
      {
        question: "Can this page check that it scans?",
        answer:
          "No. The scan check uses ZXing, which doesn't read DotCode, so it says the code wasn't checked instead of guessing. Test a print with a reader that supports DotCode.",
      },
      {
        question: "DotCode or Data Matrix?",
        answer:
          "Use the one your printer and the readers on your line support. Data Matrix is read by more scanners; DotCode suits fast inkjet printers, whose round dots don't have to join up into squares.",
      },
      {
        question: "Can a phone read DotCode?",
        answer:
          "Some barcode scanner apps can, but most phone camera apps can't. For codes people scan with a phone, use a QR code.",
      },
    ],
  },
];

const bySlug = new Map(BARCODE_FORMAT_PAGES.map((page) => [page.slug, page]));
const byId = new Map(BARCODE_FORMAT_PAGES.map((page) => [page.id, page]));

export function getBarcodeFormatPage(
  slug: string,
): BarcodeFormatPage | undefined {
  return bySlug.get(slug);
}

/** /barcode-generator/<slug> for a format. */
export function barcodeFormatPath(id: BarcodeFormatId): string {
  const page = byId.get(id);
  if (!page) throw new Error(`No page for barcode format "${id}"`);
  return `/barcode-generator/${page.slug}`;
}
