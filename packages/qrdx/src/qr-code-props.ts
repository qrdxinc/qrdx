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
  templateId: true,
  customTemplate: true,
  customProps: true,
  frame: true,
  art: true,
  eyeColors: true,
  moduleScale: true,
  autoLevel: true,
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
    if (!Object.hasOwn(QR_CODE_PROP_KEYS, key)) {
      attributes[key] = props[key];
    }
  }
  return attributes;
}

type QRData = ReturnType<typeof getQRData>;

/** What `getQRData` lays out for `QRCode`'s props. */
export function getQRCodeData(props: QRCodeProps): QRData {
  return getQRData({
    value: props.value,
    fgColor: props.fgColor,
    hideLogo: props.hideLogo,
    bgColor: props.bgColor,
    eyeColor: props.eyeColor,
    dotColor: props.dotColor,
    bodyPattern: props.bodyPattern,
    cornerEyePattern: props.cornerEyePattern,
    cornerEyeDotPattern: props.cornerEyeDotPattern,
    level: props.level,
    templateId: props.templateId,
    logo: props.logo,
    logoOptions: props.logoOptions,
    margin: props.margin ?? DEFAULT_MARGIN,
    autoLevel: props.autoLevel,
    shape: props.shape,
    eyeShapes: props.eyeShapes,
    eyeGradient: props.eyeGradient,
    bgRadius: props.bgRadius,
    backdrop: props.backdrop,
    halo: props.halo,
    shadow: props.shadow,
  });
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
    customTemplate,
    customProps,
    frame,
    art,
    eyeColors,
    moduleScale,
    autoLevel,
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
    customProps,
    customTemplate,
    dotColor: qrData.dotColor,
    eyeColor: qrData.eyeColor,
    fgColor: qrData.fgColor,
    frame,
    level: level || qrData.level,
    margin: qrData.margin,
    ...(eyeColors && { eyeColors }),
    ...(moduleScale !== undefined && { moduleScale }),
    ...(autoLevel && { autoLevel }),
    ...(shape && shape !== "square" && { shape }),
    ...looks,
    ...(frameLabelMarkers && { frameLabelMarkers }),
    ...(partMarkers && { partMarkers }),
    size: renderSize,
    style,
    templateId: qrData.templateId,
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
