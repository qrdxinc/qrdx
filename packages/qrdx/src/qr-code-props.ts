// QRCode's simpler logo API (`logo`, `logoOptions`, `hideLogo`, `scale`)
// resolved into the props QRCodeSVG draws with. The React component and the
// framework adapters share it, so a `<QRCode>` draws the same everywhere.
import type {
  LogoOptions,
  QRProps,
  QRSVGAttributes,
  QRSVGOptions,
} from "../types";
import { DEFAULT_MARGIN, DEFAULT_SIZE } from "./constants";
import { getQRData } from "./helpers";
import { isWithdrawnProp } from "./withdrawn-props";

/** `QRCode`'s props: `QRProps` plus the logo API. */
export interface QRCodeProps extends QRProps {
  hideLogo?: boolean;
  logo?: string;
  /** Size, clear space and position of `logo` (see `LogoOptions`) */
  logoOptions?: LogoOptions;
  scale?: number;
}

/**
 * `QRCode`'s props plus any root attribute (`aria-label`, `className`,
 * `role`, `id`, `data-*`…), which goes on the `<svg>` as it does with
 * `QRCodeSVG`: what the Preact and Solid `QRCode` take, and what
 * `resolveQRCodeProps` resolves. React's `QRCode` types the attributes as
 * `QRCodePropsSVG`.
 */
export type QRCodeOptions = QRCodeProps & QRSVGAttributes;

/**
 * Every prop `QRCode` draws with. Anything else among its props is a root
 * attribute. `satisfies` keeps the list complete: a new `QRCodeProps` key
 * that isn't added here fails to compile.
 */
const QR_CODE_PROP_KEYS = {
  value: true,
  size: true,
  level: true,
  bgColor: true,
  fgColor: true,
  eyeColor: true,
  dotColor: true,
  bodyPattern: true,
  cornerEyePattern: true,
  cornerEyeDotPattern: true,
  margin: true,
  style: true,
  imageSettings: true,
  isOGContext: true,
  frame: true,
  art: true,
  eyeColors: true,
  moduleScale: true,
  autoLevel: true,
  exactLevel: true,
  shape: true,
  eyeShapes: true,
  eyeGradient: true,
  bgRadius: true,
  backdrop: true,
  halo: true,
  shadow: true,
  frameLabelMarkers: true,
  partMarkers: true,
  hideLogo: true,
  logo: true,
  logoOptions: true,
  scale: true,
} as const satisfies Record<keyof QRCodeProps, true>;

/**
 * The root attributes among `QRCode`'s props, in the order they were given:
 * everything that isn't one of its own props.
 */
function rootAttributes(props: QRCodeOptions): QRSVGAttributes {
  const attributes: QRSVGAttributes = {};
  for (const key of Object.keys(props)) {
    // A withdrawn template prop is dropped, never an attribute
    if (!(Object.hasOwn(QR_CODE_PROP_KEYS, key) || isWithdrawnProp(key))) {
      attributes[key] = props[key];
    }
  }
  return attributes;
}

type QRData = ReturnType<typeof getQRData>;

/**
 * Every prop `getQRCodeData` lays the code out from, in one list. React's
 * `QRCode` keeps its layout until one of these changes, so a prop the layout
 * reads can't be left out of that check: the looks once were (the per-eye
 * shapes, the eyes' gradient span, the rounded background and its backdrop,
 * the halo and the shadow), and a code drawn without them stayed on screen
 * after one was turned on.
 */
export const QR_CODE_DATA_KEYS = [
  "value",
  "fgColor",
  "hideLogo",
  "bgColor",
  "eyeColor",
  "dotColor",
  "bodyPattern",
  "cornerEyePattern",
  "cornerEyeDotPattern",
  "level",
  "logo",
  "logoOptions",
  "margin",
  "autoLevel",
  "exactLevel",
  "shape",
  "eyeShapes",
  "eyeGradient",
  "bgRadius",
  "backdrop",
  "halo",
  "shadow",
] as const satisfies readonly (keyof QRCodeProps)[];

/** What `getQRData` lays out for `QRCode`'s props (QR_CODE_DATA_KEYS). */
export function getQRCodeData(props: QRCodeProps): QRData {
  const read = Object.fromEntries(
    QR_CODE_DATA_KEYS.map((key) => [key, props[key]])
  ) as Pick<QRCodeProps, (typeof QR_CODE_DATA_KEYS)[number]>;
  return getQRData({ ...read, margin: props.margin ?? DEFAULT_MARGIN });
}

/**
 * The `QRCodeSVG` props `QRCode` draws with, given its laid-out data. Root
 * attributes among `props` come along, after the drawing props, so they land
 * on the `<svg>` (on the frame's outer `<svg>` with a frame).
 */
export function getQRCodeSVGProps(
  props: QRCodeOptions,
  qrData: QRData
): QRSVGOptions {
  const {
    size = DEFAULT_SIZE,
    scale = 1,
    level,
    style,
    frame,
    art,
    eyeColors,
    moduleScale,
    autoLevel,
    exactLevel,
    shape,
    frameLabelMarkers,
    partMarkers,
  } = props;
  // The looks around the shapes, as getQRData kept them
  const looks = {
    ...(qrData.eyeShapes && { eyeShapes: qrData.eyeShapes }),
    ...(qrData.eyeGradient && { eyeGradient: qrData.eyeGradient }),
    ...(qrData.bgRadius && { bgRadius: qrData.bgRadius }),
    ...(qrData.backdrop && { backdrop: qrData.backdrop }),
    ...(qrData.halo && { halo: qrData.halo }),
    ...(qrData.shadow && { shadow: qrData.shadow }),
  };
  // getQRData lays the logo out on a 1024px canvas; scale it to the rendered size.
  const renderSize = size * scale;
  // Pixels of the 1024px layout → pixels of the rendered code
  const ratio = renderSize / qrData.size;
  const logoSettings = qrData.imageSettings && {
    ...qrData.imageSettings,
    height: qrData.imageSettings.height * ratio,
    width: qrData.imageSettings.width * ratio,
    ...(qrData.imageSettings.x != null && {
      x: qrData.imageSettings.x * ratio,
    }),
    ...(qrData.imageSettings.y != null && {
      y: qrData.imageSettings.y * ratio,
    }),
    ...(qrData.imageSettings.padding != null && {
      padding: qrData.imageSettings.padding * ratio,
    }),
  };

  return {
    art,
    bgColor: qrData.bgColor,
    bodyPattern: qrData.bodyPattern,
    cornerEyeDotPattern: qrData.cornerEyeDotPattern,
    cornerEyePattern: qrData.cornerEyePattern,
    dotColor: qrData.dotColor,
    eyeColor: qrData.eyeColor,
    fgColor: qrData.fgColor,
    frame,
    level: level || qrData.level,
    margin: qrData.margin,
    ...(eyeColors && { eyeColors }),
    ...(moduleScale !== undefined && { moduleScale }),
    ...(autoLevel && { autoLevel }),
    ...(exactLevel && { exactLevel }),
    ...(shape && shape !== "square" && { shape }),
    ...looks,
    ...(frameLabelMarkers && { frameLabelMarkers }),
    ...(partMarkers && { partMarkers }),
    size: renderSize,
    style,
    value: qrData.value,
    ...(logoSettings && { imageSettings: logoSettings }),
    ...rootAttributes(props),
  };
}

/**
 * `QRCode`'s props (with `logo`, `logoOptions`, `hideLogo` and `scale`, plus
 * any root attribute) as the props `createQRCodeTree` and `toSVGString`
 * take: what `<QRCode>` draws.
 */
export function resolveQRCodeProps(props: QRCodeOptions): QRSVGOptions {
  return getQRCodeSVGProps(props, getQRCodeData(props));
}
