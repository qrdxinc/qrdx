import type { INodeProperties } from "n8n-workflow";
import {
  BARCODE_DATA_MAX_LENGTH,
  BARCODE_HEIGHT,
  BARCODE_QUIET_ZONE,
  BARCODE_SCALE,
  DEFAULT_BASE_URL,
} from "../constants";

const show = { resource: ["barcodeImage"], operation: ["generate"] };

export const barcodeImageOperations: INodeProperties[] = [
  {
    displayName: "Operation",
    name: "operation",
    type: "options",
    noDataExpression: true,
    displayOptions: { show: { resource: ["barcodeImage"] } },
    options: [
      {
        name: "Generate",
        value: "generate",
        description:
          "Make a barcode image (EAN, UPC, Code 128, Data Matrix and more) as PNG, JPG, WebP, AVIF, BMP, SVG, PDF or EPS. Needs no API key.",
        action: "Generate a barcode image",
      },
    ],
    default: "generate",
  },
];

export const barcodeImageFields: INodeProperties[] = [
  {
    displayName: "Format",
    name: "barcodeFormat",
    type: "options",
    options: [
      {
        name: "Aztec",
        value: "aztec",
        description:
          "2D code that needs no margin, for tickets and transport; any text up to 1,000 characters",
      },
      {
        name: "Codabar",
        value: "codabar",
        description:
          "Digits for libraries, blood banks and older labels; starts and ends with A, B, C or D",
      },
      {
        name: "Code 128",
        value: "code128",
        description:
          "Letters, digits and symbols for labels, tickets and inventory; up to 80 plain ASCII characters",
      },
      {
        name: "Code 39",
        value: "code39",
        description:
          "Capital letters and digits for older scanners; up to 40 characters",
      },
      {
        name: "Code 93",
        value: "code93",
        description:
          "Code 39's characters in a shorter barcode; up to 40 characters",
      },
      {
        name: "Data Matrix",
        value: "datamatrix",
        description:
          "Small square 2D code for parts and labels; any text up to 1,000 characters",
      },
      {
        name: "EAN-13",
        value: "ean13",
        description:
          "Retail products sold worldwide; 12 digits, or 13 with the check digit",
      },
      {
        name: "EAN-8",
        value: "ean8",
        description: "Small retail packs; 7 digits, or 8 with the check digit",
      },
      {
        name: "GS1 DataBar",
        value: "gs1-databar",
        description:
          "A GTIN on small retail items, as (01) and 14 digits, like (01)09501101530003",
      },
      {
        name: "GS1 DataBar Expanded",
        value: "gs1-databar-expanded",
        description:
          "A GTIN with a weight, price or date for the checkout, as Application Identifiers in brackets, like (01)09501101530003(17)261231",
      },
      {
        name: "GS1-128",
        value: "gs1-128",
        description:
          "Supply chain data (GTIN, batch, dates, weights) as Application Identifiers in brackets, like (01)09501101530003(10)AB-123",
      },
      {
        name: "ISBN",
        value: "isbn",
        description:
          "Books: an ISBN-13 or ISBN-10, printed with the ISBN above the bars; a 2- or 5-digit add-on after a space",
      },
      {
        name: "ISMN",
        value: "ismn",
        description:
          "Printed music: an ISMN starting 979-0, or the old form starting with M; a 2- or 5-digit add-on after a space",
      },
      {
        name: "ISSN",
        value: "issn",
        description:
          "Magazines and journals: the ISSN, then the 2-digit sequence variant and an issue add-on, like 0317-8471 00 05",
      },
      {
        name: "ITF-14",
        value: "itf14",
        description:
          "Shipping cartons holding retail products; 13 digits, or 14 with the check digit",
      },
      {
        name: "PDF417",
        value: "pdf417",
        description:
          "Stacked 2D code for IDs, boarding passes and documents; any text up to 1,000 characters",
      },
      {
        name: "UPC-A",
        value: "upca",
        description:
          "Retail products in the US and Canada; 11 digits, or 12 with the check digit",
      },
      {
        name: "UPC-E",
        value: "upce",
        description:
          "A UPC-A number shortened for small packs; 6 to 8 digits, or a 12-digit UPC-A that can be shortened",
      },
    ],
    default: "ean13",
    description: "The kind of barcode",
    displayOptions: { show },
  },
  {
    displayName: "Data",
    name: "data",
    type: "string",
    required: true,
    default: "",
    placeholder: "5901234123457",
    description: `The number or text to encode, up to ${BARCODE_DATA_MAX_LENGTH.toLocaleString("en-US")} characters. Retail numbers (EAN, UPC, ITF-14, GS1 GTINs) can leave the check digit off and QRdx adds it; a wrong one is an error.`,
    displayOptions: { show },
  },
  {
    displayName: "File Type",
    name: "fileType",
    type: "options",
    options: [
      {
        name: "AVIF",
        value: "avif",
        description: "The smallest files, for modern browsers",
      },
      {
        name: "BMP",
        value: "bmp",
        description:
          "Uncompressed 24-bit bitmap for older systems that only take BMP",
      },
      {
        name: "EPS",
        value: "eps",
        description: "Vector PostScript for older print workflows",
      },
      {
        name: "JPG",
        value: "jpg",
        description: "An image for places that don't take PNG",
      },
      {
        name: "PDF",
        value: "pdf",
        description: "Vector, opens anywhere, for print",
      },
      {
        name: "PNG",
        value: "png",
        description: "An image for screens, documents and online shops",
      },
      {
        name: "SVG",
        value: "svg",
        description: "Vector image for print and design tools",
      },
      {
        name: "WebP",
        value: "webp",
        description: "A smaller image file for websites",
      },
    ],
    default: "png",
    displayOptions: { show },
  },
  {
    displayName: "Put Output File in Field",
    name: "binaryPropertyName",
    type: "string",
    required: true,
    default: "data",
    hint: "The name of the output binary field to put the file in",
    displayOptions: { show },
  },
  {
    displayName: "Options",
    name: "options",
    type: "collection",
    placeholder: "Add Option",
    default: {},
    displayOptions: { show },
    options: [
      {
        displayName: "Background Color",
        name: "backgroundColor",
        type: "color",
        default: "#ffffff",
      },
      {
        displayName: "Bar Height",
        name: "barHeight",
        type: "number",
        typeOptions: {
          minValue: BARCODE_HEIGHT.min,
          maxValue: BARCODE_HEIGHT.max,
        },
        default: 23,
        description:
          "Height of the bars of linear barcodes, in millimetres at the vector size. Left out, each format uses its own: 23 for EAN-13 and UPC, 15 for Code 128.",
      },
      {
        displayName: "Base URL",
        name: "baseUrl",
        type: "string",
        default: DEFAULT_BASE_URL,
        description:
          "The QRdx API that draws the image. Change it only for a self-hosted copy of QRdx.",
      },
      {
        displayName: "File Name",
        name: "fileName",
        type: "string",
        default: "barcode",
        description:
          "Name of the output file; the file type's extension is added",
      },
      {
        displayName: "Foreground Color",
        name: "foregroundColor",
        type: "color",
        default: "#000000",
        description: "Color of the bars and the printed text",
      },
      {
        displayName: "Quiet Zone",
        name: "quietZone",
        type: "number",
        typeOptions: {
          minValue: BARCODE_QUIET_ZONE.min,
          maxValue: BARCODE_QUIET_ZONE.max,
        },
        default: 10,
        description:
          "Blank margin in modules: left and right of linear barcodes (up to 20), all round 2D codes (up to 10). Left out, each format uses its own: 11 for EAN-13, 10 for Code 128.",
      },
      {
        displayName: "Rotation",
        name: "rotation",
        type: "options",
        options: [
          { name: "None", value: "0" },
          { name: "90° Clockwise", value: "90" },
          { name: "180°", value: "180" },
          { name: "270° Clockwise", value: "270" },
        ],
        default: "0",
      },
      {
        displayName: "Scale",
        name: "scale",
        type: "number",
        typeOptions: {
          minValue: BARCODE_SCALE.min,
          maxValue: BARCODE_SCALE.max,
        },
        default: 4,
        description:
          "Pixels per module (the narrowest bar, or one 2D cell) in PNG, JPG, WebP, AVIF and BMP files. SVG, PDF and EPS are vectors at one point per module.",
      },
      {
        displayName: "Show Text",
        name: "showText",
        type: "boolean",
        default: true,
        description:
          "Whether to print the digits or text under the bars of linear barcodes",
      },
    ],
  },
];
