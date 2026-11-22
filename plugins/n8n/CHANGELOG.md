# Changelog

## Unreleased

QR Image → Generate can return ICO (a favicon with 16, 32, 48 and 256 px images in one file) and GIF (at most 256 colors; a design that would stop scanning when reduced is refused).

Barcode Image → Generate makes barcodes with no API key (`GET /barcode`): EAN-13, EAN-8, UPC-A, UPC-E, ISBN, ISSN, ISMN, Code 128, Code 39, Code 93, Codabar, ITF-14, GS1-128, GS1 DataBar, GS1 DataBar Expanded, Data Matrix, PDF417 and Aztec, as PNG, JPG, WebP, AVIF, BMP, SVG, PDF or EPS, with colors, scale, bar height, quiet zone, printed text and rotation.

QR Image → Generate's description lists every format it makes (PNG, WebP, GIF, BMP, ICO, SVG and EPS).

## 0.1.2

QR Image → Generate can return BMP (24-bit; a transparent background comes out white).

Scan → Range has All Time: the whole history, from the code's first scan (Pro and Business; other plans get 30 days).

## 0.1.1

QR Image → Generate can return WebP (lossless) as well as PNG, SVG and EPS.

## 0.1.0

First version: the QRdx node (QR images, dynamic codes, scans and themes), the QRdx Trigger node (REST hooks with signature checks) and the QRdx API credential.
