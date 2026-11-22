// SIX's own sample data for the Swiss QR-bill, verbatim: "Data schema for
// samples (txt format)" from the SIX Download Centre
// (six-group.com/dam/download/banking-services/standardization/qr-bill/
// samples-data-schema-en.zip). UTF-8, CRLF, no line break after the last
// element. Sample 5 adds an alternative procedure (eBill), which QRdx
// doesn't write; the scanner still reads it.

export const SIX_SAMPLES = {
  nr1: "SPC\r\n0200\r\n1\r\nCH6431961000004421557\r\nS\r\nHealth insurance fit&kicking\r\nAm Wasser\r\n1\r\n3000\r\nBern\r\nCH\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n111.00\r\nCHF\r\nS\r\nSarah Beispiel\r\nMustergasse\r\n1\r\n3600\r\nThun\r\nCH\r\nQRR\r\n000008207791225857421286694\r\nPremium calculation July 2020\r\nEPD",
  nr5: "SPC\r\n0200\r\n1\r\nCH2231989000007611146\r\nS\r\nHealth insurance fit&kicking\r\nAm Wasser\r\n1\r\n3000\r\nBern\r\nCH\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n121.00\r\nCHF\r\nS\r\nSarah Beispiel\r\nMustergasse\r\n1\r\n3600\r\nThun\r\nCH\r\nQRR\r\n000003701588132583136809972\r\nPremium calculation July 2020\r\nEPD\r\n//S1/10/10201409/11/200630/20/140.000-53/30/102673831/31/200630/32/7.7/33/7.7:9.30/40/0:30\r\neBill/B/sarah.beispiel@einfach-zahlen.ch",
  nr13: "SPC\r\n0200\r\n1\r\nCH7331955000007324129\r\nS\r\nHealth insurance fit&kicking\r\nAm Wasser\r\n1\r\n3000\r\nBern\r\nCH\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n141.00\r\nCHF\r\nS\r\nSarah Beispiel\r\nMustergasse\r\n1\r\n3600\r\nThun\r\nCH\r\nQRR\r\n000003983456426900478123999\r\nPremium calculation July 2020\r\nEPD\r\n//S1/10/10201409/11/200630/20/140.000-53/30/102673831/31/200630/32/7.7/33/7.7:10.85/40/0:30",
  nr17: "SPC\r\n0200\r\n1\r\nCH5800791123000889012\r\nS\r\nHealth insurance fit&kicking\r\nAm Wasser\r\n1\r\n3000\r\nBern\r\nCH\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n211.00\r\nCHF\r\nS\r\nSarah Beispiel\r\nMustergasse\r\n1\r\n3600\r\nThun\r\nCH\r\nSCOR\r\nRF240191230100405JSH0438\r\nPremium calculation July 2020\r\nEPD",
  nr29: "SPC\r\n0200\r\n1\r\nCH5800791123000889012\r\nS\r\nHealth insurance fit&kicking\r\nAm Wasser\r\n1\r\n3000\r\nBern\r\nCH\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n241.00\r\nCHF\r\nS\r\nSarah Beispiel\r\nMustergasse\r\n1\r\n3600\r\nThun\r\nCH\r\nSCOR\r\nRF8720191230100610TBL0982\r\nPremium calculation July 2020\r\nEPD\r\n//S1/10/10201409/11/200630/20/140.000-53/30/102673831/31/200630/32/7.7/33/7.7:18.55/40/0:30",
  nr33: "SPC\r\n0200\r\n1\r\nCH5800791123000889012\r\nS\r\nHealth insurance fit&kicking\r\nAm Wasser\r\n1\r\n3000\r\nBern\r\nCH\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n311.00\r\nCHF\r\nS\r\nSarah Beispiel\r\nMustergasse\r\n1\r\n3600\r\nThun\r\nCH\r\nNON\r\n\r\nPremium calculation July 2020\r\nEPD",
  nr45: "SPC\r\n0200\r\n1\r\nCH5800791123000889012\r\nS\r\nHealth insurance fit&kicking\r\nAm Wasser\r\n1\r\n3000\r\nBern\r\nCH\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n341.00\r\nCHF\r\nS\r\nSarah Beispiel\r\nMustergasse\r\n1\r\n3600\r\nThun\r\nCH\r\nNON\r\n\r\nPremium calculation July 2020\r\nEPD\r\n//S1/10/10201409/11/200630/20/140.000-53/30/102673831/31/200630/32/7.7/33/7.7:26.25/40/0:30",
} as const;

/**
 * What the QR image of the guidelines' example 3 encodes (IG v2.4 Annex A,
 * decoded): LF, and a line break after EPD.
 */
export const IG_EXAMPLE_3_IMAGE =
  "SPC\n0200\n1\nCH5204835012345671000\nS\nSample Foundation\nPO Box\n\n3001\nBern\nCH\n\n\n\n\n\n\n\n\nCHF\n\n\n\n\n\n\n\nNON\n\n\nEPD\n";
