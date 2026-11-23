import type { QRProps } from "../types";
import { canvasToBMP } from "./bmp";
import { DEFAULT_SIZE } from "./constants";
import { epsToDataUrl, getQRAsEPS } from "./eps";
import { getQRAsCanvas, getQRAsSVGDataUri } from "./export";
import { getFrameDimensions } from "./frame";
import { canvasToGIF, GIF_MIME } from "./gif";
import { canvasesToICO, ICO_MIME, ICO_SIZES } from "./ico";
import { canvasToTIFF, TIFF_MIME, type TIFFOptions } from "./tiff";
import { blobToDataUrl, canvasToWebP, type WebPOptions } from "./webp";

/**
 * "webp" is lossless unless `quality` is set. "bmp" is an uncompressed
 * 24-bit bitmap: a transparent background comes out white. "gif" keeps a
 * transparent background as GIF's one transparent color and holds at most
 * 256 colors: a design that needs more is reduced, and refused (a
 * GIFScanError) when the reduced image would no longer scan. "ico" is one
 * favicon file holding the code at 16, 32, 48 and 256 px, each an embedded
 * PNG with its transparency; `size` doesn't apply, and a frame is left out.
 * "tiff" is RGBA with its transparency, at 300 dpi; "tiff-cmyk" is the same
 * file in CMYK for print (pure black as K only, by the conversion the print
 * PDF and EPS use; a transparent background comes out white).
 * "eps" is vector PostScript: `size.width` becomes points (72 per inch).
 */
export type DownloadFormat =
  | "png"
  | "jpg"
  | "webp"
  | "bmp"
  | "gif"
  | "ico"
  | "tiff"
  | "tiff-cmyk"
  | "svg"
  | "pdf"
  | "eps";

export interface DownloadFormatInfo {
  mimeType: string;
  extension: string;
  /** No pixel size: the file name states none. */
  vector: boolean;
  /** The pixel sizes one file holds at once (ICO); its file name states none. */
  sizes?: readonly number[];
  /** Added to the file name before the extension (TIFF's CMYK: "-cmyk") */
  nameSuffix?: string;
}

/**
 * Every download format with its MIME type and file extension. Each is made
 * by one branch of downloadQRCode and getQRCodeDataUrl: PNG and JPG by the
 * canvas, WebP by canvasToWebP (the canvas, or the built-in lossless
 * encoder), BMP by canvasToBMP and GIF by canvasToGIF (the built-in encoders:
 * no browser writes either),
 * ICO by canvasesToICO (a PNG of each size inside the built-in ICO writer),
 * TIFF by canvasToTIFF (the built-in encoder, RGBA or CMYK),
 * SVG from the markup, PDF with jspdf, EPS by getQRAsEPS. A new
 * format needs an entry here and a branch there.
 */
export const DOWNLOAD_FORMATS: Record<DownloadFormat, DownloadFormatInfo> = {
  png: { mimeType: "image/png", extension: "png", vector: false },
  jpg: { mimeType: "image/jpeg", extension: "jpg", vector: false },
  webp: { mimeType: "image/webp", extension: "webp", vector: false },
  bmp: { mimeType: "image/bmp", extension: "bmp", vector: false },
  gif: { mimeType: GIF_MIME, extension: "gif", vector: false },
  ico: {
    mimeType: ICO_MIME,
    extension: "ico",
    vector: false,
    sizes: ICO_SIZES,
  },
  tiff: { mimeType: TIFF_MIME, extension: "tif", vector: false },
  "tiff-cmyk": {
    mimeType: TIFF_MIME,
    extension: "tif",
    vector: false,
    nameSuffix: "-cmyk",
  },
  svg: { mimeType: "image/svg+xml", extension: "svg", vector: true },
  // A PDF download holds the PNG, so it's named after its pixel size.
  pdf: { mimeType: "application/pdf", extension: "pdf", vector: false },
  eps: { mimeType: "application/postscript", extension: "eps", vector: true },
};

export interface DownloadSize {
  width: number;
  height: number;
}

export const PRESET_SIZES: Record<string, DownloadSize> = {
  small: { width: 200, height: 200 },
  medium: { width: 400, height: 400 },
  large: { width: 800, height: 800 },
  xlarge: { width: 1200, height: 1200 },
  "2xl": { width: 1600, height: 1600 },
  "3xl": { width: 2000, height: 2000 },
};

export interface DownloadOptions {
  format: DownloadFormat;
  size: DownloadSize;
  filename?: string;
  /** WebP only: 0 to 1 for a smaller lossy file (see `WebPOptions`). */
  quality?: number;
}

/**
 * Validates if a size value is within acceptable bounds
 */
export function validateSize(
  width: number,
  height: number
): {
  isValid: boolean;
  error?: string;
} {
  const MIN_SIZE = 50;
  const MAX_SIZE = 5000;

  if (width < MIN_SIZE || height < MIN_SIZE) {
    return {
      isValid: false,
      error: `Size must be at least ${MIN_SIZE}x${MIN_SIZE} pixels`,
    };
  }

  if (width > MAX_SIZE || height > MAX_SIZE) {
    return {
      isValid: false,
      error: `Size must not exceed ${MAX_SIZE}x${MAX_SIZE} pixels`,
    };
  }

  if (width !== height) {
    return {
      isValid: false,
      error: "Width and height must be equal for QR codes",
    };
  }

  return { isValid: true };
}

/**
 * Returns props rendered at `size`. A logo laid out for the props' own `size`
 * (as `getQRData` does on a 1024px canvas) is scaled along with the code.
 */
export function withQRSize(qrProps: QRProps, size: number): QRProps {
  const { imageSettings, size: fromSize } = qrProps;
  if (!(imageSettings && fromSize) || fromSize === size) {
    return { ...qrProps, size };
  }
  const ratio = size / fromSize;
  return {
    ...qrProps,
    size,
    imageSettings: {
      ...imageSettings,
      width: imageSettings.width * ratio,
      height: imageSettings.height * ratio,
      ...(imageSettings.x != null && { x: imageSettings.x * ratio }),
      ...(imageSettings.y != null && { y: imageSettings.y * ratio }),
      ...(imageSettings.padding != null && {
        padding: imageSettings.padding * ratio,
      }),
    },
  };
}

/**
 * Downloads a file to the user's device
 */
export function downloadFile(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const getMimeType = (format: DownloadFormat): string =>
  (DOWNLOAD_FORMATS[format] ?? DOWNLOAD_FORMATS.png).mimeType;

/**
 * The default file name of a download: for PNG, JPG, WebP, GIF and BMP (and the image
 * a PDF holds) the exact pixel size of what is saved, which a frame makes
 * bigger than the code (a 400 px code in a bottom banner is 496 × 568);
 * SVG and EPS have no pixel size and name none, and nor does an ICO, which
 * holds several.
 */
export function getDownloadFilename(
  format: DownloadFormat,
  size: DownloadSize,
  frame?: QRProps["frame"]
): string {
  const {
    extension,
    vector,
    sizes,
    nameSuffix = "",
  } = DOWNLOAD_FORMATS[format];
  if (vector || sizes) {
    return `qr-code${nameSuffix}.${extension}`;
  }
  // The canvas size getQRAsCanvas and getQRAsPDF draw on
  const { width, height } = getFrameDimensions(size.width, frame);
  return `qr-code-${Math.round(width)}x${Math.round(height)}${nameSuffix}.${extension}`;
}

/**
 * The code as a WebP image (plus its frame, if any): lossless unless
 * `options.quality` is set, with a transparent background kept. Browsers
 * that can't encode WebP (Safari) get it from QRdx's own lossless encoder,
 * never a PNG in disguise.
 */
export async function getQRAsWebP(
  qrProps: QRProps,
  options: WebPOptions = {}
): Promise<Blob> {
  const canvas = (await getQRAsCanvas(
    qrProps,
    "image/webp",
    true
  )) as HTMLCanvasElement;
  try {
    return await canvasToWebP(canvas, options);
  } finally {
    canvas.remove();
  }
}

/**
 * The code as a TIFF (plus its frame, if any): RGBA with its transparency,
 * or CMYK for print with `colorMode: "cmyk"`. 300 dpi unless `dpi` is set.
 * Every browser gets it from QRdx's own encoder.
 */
export async function getQRAsTIFF(
  qrProps: QRProps,
  options: TIFFOptions = {}
): Promise<Blob> {
  const canvas = (await getQRAsCanvas(
    qrProps,
    "image/png",
    true
  )) as HTMLCanvasElement;
  try {
    return await canvasToTIFF(canvas, options);
  } finally {
    canvas.remove();
  }
}

/**
 * The code as a 24-bit BMP image (plus its frame, if any). A transparent
 * background comes out white. Every browser gets it from QRdx's own encoder.
 */
export async function getQRAsBMP(qrProps: QRProps): Promise<Blob> {
  const canvas = (await getQRAsCanvas(
    qrProps,
    "image/png",
    true
  )) as HTMLCanvasElement;
  try {
    return canvasToBMP(canvas);
  } finally {
    canvas.remove();
  }
}

/**
 * The code as a GIF image (plus its frame, if any), with a transparent
 * background kept as GIF's one transparent color. A design that needs more
 * than 256 colors is reduced to a palette, and refused with a GIFScanError
 * when the reduced image would no longer scan. Every browser gets it from
 * QRdx's own encoder.
 */
export async function getQRAsGIF(qrProps: QRProps): Promise<Blob> {
  const canvas = (await getQRAsCanvas(
    qrProps,
    "image/png",
    true
  )) as HTMLCanvasElement;
  try {
    return await canvasToGIF(canvas, qrProps.value);
  } finally {
    canvas.remove();
  }
}

/**
 * The code as an ICO favicon holding it at each of `sizes` (16, 32, 48 and 256
 * px by default), each an embedded PNG that keeps a transparent background.
 * The size of `qrProps` doesn't apply, and a frame is left out: the
 * images are square and no taller than 256 px. Every browser gets it from
 * QRdx's own writer. Small sizes are for icons, not for scanning.
 */
export async function getQRAsICO(
  qrProps: QRProps,
  sizes: readonly number[] = ICO_SIZES
): Promise<Blob> {
  const canvases: HTMLCanvasElement[] = [];
  try {
    for (const size of sizes) {
      canvases.push(
        (await getQRAsCanvas(
          withQRSize({ ...qrProps, frame: undefined }, size),
          "image/png",
          true
        )) as HTMLCanvasElement
      );
    }
    return canvasesToICO(canvases);
  } finally {
    for (const canvas of canvases) {
      canvas.remove();
    }
  }
}

// One CSS pixel = one PostScript point (72 per inch).
const MM_PER_POINT = 25.4 / 72;

/** EPS of the code at `size` points wide, as a data URL. */
async function getQRAsEPSDataUrl(qrProps: QRProps): Promise<string> {
  const eps = await getQRAsEPS(qrProps, {
    sizeMm: (qrProps.size ?? DEFAULT_SIZE) * MM_PER_POINT,
  });
  return epsToDataUrl(eps);
}

/**
 * Convert QR code to PDF format
 */
async function getQRAsPDF(qrProps: QRProps): Promise<string> {
  // jspdf is an optional peer dependency, loaded only when a PDF is requested.
  let jsPDF: typeof import("jspdf").jsPDF;
  try {
    ({ jsPDF } = await import("jspdf"));
  } catch (error) {
    throw new Error(
      `PDF export needs the optional "jspdf" package. Install it with \`npm install jspdf\`. (${error})`
    );
  }

  // Get the SVG as a data URI
  const svgDataUri = await getQRAsSVGDataUri(qrProps);
  const svgString = decodeURIComponent(
    svgDataUri.replace("data:image/svg+xml,", "")
  );

  // Convert SVG to base64 for better compatibility
  let base64DataUri: string;
  try {
    const utf8Bytes = new TextEncoder().encode(svgString);
    const binaryString = Array.from(utf8Bytes, (byte) =>
      String.fromCharCode(byte)
    ).join("");
    const base64SVG = btoa(binaryString);
    base64DataUri = `data:image/svg+xml;base64,${base64SVG}`;
  } catch (error) {
    throw new Error(`Failed to encode SVG for PDF conversion: ${error}`);
  }

  const { width, height } = getFrameDimensions(
    qrProps.size || DEFAULT_SIZE,
    qrProps.frame
  );

  // Get canvas from SVG using base64 encoding
  const canvas = await new Promise<HTMLCanvasElement>((resolve, reject) => {
    const img = new Image();
    const tempCanvas = document.createElement("canvas");

    tempCanvas.width = Math.round(width);
    tempCanvas.height = Math.round(height);

    const ctx = tempCanvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Could not get canvas context"));
      return;
    }

    // Add timeout to prevent hanging
    const timeout = setTimeout(() => {
      tempCanvas.remove();
      reject(
        new Error(
          "SVG load timeout - image may be too large or contain invalid data"
        )
      );
    }, 30_000); // 30 second timeout

    img.onload = () => {
      clearTimeout(timeout);
      try {
        ctx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
        resolve(tempCanvas);
      } catch (error) {
        clearTimeout(timeout);
        tempCanvas.remove();
        reject(new Error(`Failed to draw image to canvas: ${error}`));
      }
    };

    img.onerror = () => {
      clearTimeout(timeout);
      tempCanvas.remove();
      reject(new Error("Could not load SVG for PDF conversion"));
    };

    img.src = base64DataUri;
  });

  // Create PDF with the canvas
  const imgData = canvas.toDataURL("image/png", 1.0);
  // Convert pixels to mm (assuming 96 DPI)
  const mmWidth = width * 0.264_583;
  const mmHeight = height * 0.264_583;

  const pdf = new jsPDF({
    orientation: mmWidth > mmHeight ? "landscape" : "portrait",
    unit: "mm",
    format: [mmWidth, mmHeight],
  });

  pdf.addImage(imgData, "PNG", 0, 0, mmWidth, mmHeight);

  canvas.remove();

  // Return as data URL
  return pdf.output("dataurlstring");
}

/**
 * Downloads a QR code with the specified options
 */
export async function downloadQRCode(
  qrProps: QRProps,
  options: DownloadOptions
): Promise<void> {
  const { format, size, filename, quality } = options;

  // Validate size
  const validation = validateSize(size.width, size.height);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  // Create props with the custom size (QR codes are square, so use width)
  const propsWithSize = withQRSize(qrProps, size.width);

  const finalFilename =
    filename || getDownloadFilename(format, size, qrProps.frame);

  try {
    if (format === "svg") {
      // Download as SVG
      const svgDataUri = await getQRAsSVGDataUri(propsWithSize);
      downloadFile(svgDataUri, finalFilename);
    } else if (format === "pdf") {
      // Download as PDF
      const pdfDataUrl = await getQRAsPDF(propsWithSize);
      downloadFile(pdfDataUrl, finalFilename);
    } else if (format === "eps") {
      downloadFile(await getQRAsEPSDataUrl(propsWithSize), finalFilename);
    } else if (format === "webp") {
      const webp = await getQRAsWebP(propsWithSize, { quality });
      downloadFile(await blobToDataUrl(webp), finalFilename);
    } else if (format === "bmp") {
      const bmp = await getQRAsBMP(propsWithSize);
      downloadFile(await blobToDataUrl(bmp), finalFilename);
    } else if (format === "gif") {
      const gif = await getQRAsGIF(propsWithSize);
      downloadFile(await blobToDataUrl(gif), finalFilename);
    } else if (format === "ico") {
      const ico = await getQRAsICO(propsWithSize);
      downloadFile(await blobToDataUrl(ico), finalFilename);
    } else if (format === "tiff" || format === "tiff-cmyk") {
      const tiff = await getQRAsTIFF(propsWithSize, {
        colorMode: format === "tiff-cmyk" ? "cmyk" : "rgb",
      });
      downloadFile(await blobToDataUrl(tiff), finalFilename);
    } else {
      // Download as PNG or JPG
      const mimeType = getMimeType(format);
      const dataUrl = await getQRAsCanvas(propsWithSize, mimeType);
      if (typeof dataUrl === "string") {
        downloadFile(dataUrl, finalFilename);
      } else {
        throw new Error("Failed to generate image data URL");
      }
    }
  } catch (error) {
    console.error(`Error downloading ${format.toUpperCase()}:`, error);
    throw error;
  }
}

/**
 * Gets a QR code as a data URL for preview or other purposes
 */
export async function getQRCodeDataUrl(
  qrProps: QRProps,
  format: DownloadFormat,
  size: DownloadSize,
  options: WebPOptions = {}
): Promise<string> {
  // Validate size
  const validation = validateSize(size.width, size.height);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  // Create props with the custom size
  const propsWithSize = withQRSize(qrProps, size.width);

  if (format === "svg") {
    return await getQRAsSVGDataUri(propsWithSize);
  }

  if (format === "pdf") {
    return await getQRAsPDF(propsWithSize);
  }

  if (format === "eps") {
    return await getQRAsEPSDataUrl(propsWithSize);
  }

  if (format === "webp") {
    return await blobToDataUrl(await getQRAsWebP(propsWithSize, options));
  }

  if (format === "bmp") {
    return await blobToDataUrl(await getQRAsBMP(propsWithSize));
  }

  if (format === "gif") {
    return await blobToDataUrl(await getQRAsGIF(propsWithSize));
  }

  if (format === "ico") {
    return await blobToDataUrl(await getQRAsICO(propsWithSize));
  }

  if (format === "tiff" || format === "tiff-cmyk") {
    return await blobToDataUrl(
      await getQRAsTIFF(propsWithSize, {
        colorMode: format === "tiff-cmyk" ? "cmyk" : "rgb",
      })
    );
  }

  const mimeType = getMimeType(format);
  const result = await getQRAsCanvas(propsWithSize, mimeType);

  if (typeof result === "string") {
    return result;
  }

  throw new Error("Failed to generate QR code data URL");
}

/**
 * Copies QR code to clipboard (works best with PNG format)
 */
export async function copyQRCodeToClipboard(
  qrProps: QRProps,
  size: DownloadSize = { width: DEFAULT_SIZE, height: DEFAULT_SIZE }
): Promise<void> {
  try {
    // Validate size
    const validation = validateSize(size.width, size.height);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const propsWithSize = withQRSize(qrProps, size.width);

    // Render inside a promise handed straight to ClipboardItem: Safari rejects
    // clipboard writes that start after an await (outside the user gesture).
    const imageBlob = getQRAsCanvas(propsWithSize, "image/png", true).then(
      (result) =>
        new Promise<Blob>((resolve, reject) => {
          const canvas = result as HTMLCanvasElement;
          canvas.toBlob((canvasBlob) => {
            canvas.remove();
            if (canvasBlob) {
              resolve(canvasBlob);
            } else {
              reject(new Error("Failed to create blob from canvas"));
            }
          }, "image/png");
        })
    );

    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": imageBlob,
      }),
    ]);
  } catch (error) {
    console.error("Error copying to clipboard:", error);
    throw error;
  }
}

/**
 * Gets SVG content as string (useful for copying SVG code)
 */
export async function getSVGString(qrProps: QRProps): Promise<string> {
  const svgDataUri = await getQRAsSVGDataUri(qrProps);
  return decodeURIComponent(svgDataUri.replace("data:image/svg+xml,", ""));
}
