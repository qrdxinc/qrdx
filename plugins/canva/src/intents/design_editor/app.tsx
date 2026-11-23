import { useFeatureSupport } from "@canva/app-hooks";
import {
  Button,
  FormField,
  Link,
  Rows,
  SegmentedControl,
  Swatch,
  Text,
  TextInput,
} from "@canva/app-ui-kit";
import { openColorSelector } from "@canva/asset";
import { addElementAtCursor, addElementAtPoint } from "@canva/design";
import { requestOpenExternalUrl } from "@canva/platform";
import type {
  BodyPattern,
  CornerEyeDotPattern,
  CornerEyePattern,
  ErrorLevel,
} from "qrdx";
import {
  BODY_PATTERN,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  getQRAsCanvas,
  getQRData,
  QRCode,
} from "qrdx";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
// biome-ignore lint/correctness/noUndeclaredDependencies: "styles/" is a tsconfig/webpack path alias
import * as styles from "styles/components.css";
import { playgroundLink } from "../../playground-link";

// The brand name, URLs, hex colors and the L/M/Q/H levels stay as they are
// in every language; everything else the user reads is a react-intl message
// (Canva translates them from dist/messages_en.json).
const BRAND = "QRdx";
const QRDX_LOGO = "https://qrdx.dev/logo.png";
const URL_EXAMPLE = "https://example.com";
const LOGO_URL_EXAMPLE = "https://example.com/logo.png";
/** How far the arrow button scrolls a row of pattern choices, in pixels. */
const PICKER_SCROLL_STEP = 160;

/** Whether `element` lays out right to left, from its computed style. */
const isRtl = (element: Element) =>
  getComputedStyle(element).direction === "rtl";

const BODY_PATTERNS = [...BODY_PATTERN] as BodyPattern[];
const EYE_PATTERNS: CornerEyePattern[] = [...CORNER_EYE_PATTERNS];
const EYE_DOT_PATTERNS: CornerEyeDotPattern[] = [...CORNER_EYE_DOT_PATTERNS];
const ERROR_LEVELS: ErrorLevel[] = ["L", "M", "Q", "H"];
const PREVIEW_VALUE = "https://qrdx.dev";

interface HorizontalPickerProps<T extends string> {
  label: ReactNode;
  options: T[];
  value: T;
  onChange: (v: T) => void;
  renderCard: (option: T) => React.ReactNode;
}

function HorizontalPicker<T extends string>({
  label,
  options,
  value,
  onChange,
  renderCard,
}: HorizontalPickerProps<T>) {
  const intl = useIntl();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scrolls toward the end of the row: right in left-to-right languages,
  // left in right-to-left ones.
  const scrollForward = () => {
    const row = scrollRef.current;
    if (!row) return;
    row.scrollBy({
      left: isRtl(row) ? -PICKER_SCROLL_STEP : PICKER_SCROLL_STEP,
      behavior: "smooth",
    });
  };

  return (
    <div>
      <div className={styles.pickerLabel}>
        <Text size="small">{label}</Text>
      </div>
      <div className={styles.pickerRow}>
        <div className={styles.pickerScroll} ref={scrollRef}>
          {options.map((option) => (
            <button
              className={`${styles.pickerCard} ${option === value ? styles.pickerCardSelected : ""}`}
              key={option}
              onClick={() => onChange(option)}
              type="button"
            >
              {renderCard(option)}
            </button>
          ))}
        </div>
        <button
          aria-label={intl.formatMessage({
            defaultMessage: "Show more patterns",
            description:
              "Screen reader label for the arrow button at the end of a row of QR code pattern choices. Clicking it scrolls the row to show more patterns.",
          })}
          className={styles.pickerScrollBtn}
          onClick={scrollForward}
          type="button"
        >
          {/* In right-to-left languages the browser draws "›" as "‹" (Unicode
              bidi mirroring), so it points toward the end of the row without
              a flip. */}
          ›
        </button>
      </div>
    </div>
  );
}

export const App = () => {
  const intl = useIntl();
  const isSupported = useFeatureSupport();
  const addElement = [addElementAtPoint, addElementAtCursor].find((fn) =>
    isSupported(fn)
  );

  const [url, setUrl] = useState("https://qrdx.dev");
  const [fgColor, setFgColor] = useState("#000000");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [eyeColor, setEyeColor] = useState("#000000");
  const [dotColor, setDotColor] = useState("#000000");
  const [bodyPattern, setBodyPattern] = useState<BodyPattern>("circle");
  const [cornerEyePattern, setCornerEyePattern] =
    useState<CornerEyePattern>("gear");
  const [cornerEyeDotPattern, setCornerEyeDotPattern] =
    useState<CornerEyeDotPattern>("circle");
  const [errorLevel, setErrorLevel] = useState<ErrorLevel>("Q");
  const [showLogo, setShowLogo] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [addFailed, setAddFailed] = useState(false);

  const addToDesign = async () => {
    if (!(addElement && url)) return;
    setIsLoading(true);
    setAddFailed(false);

    try {
      const qrData = getQRData({
        value: url,
        size: 1024,
        fgColor,
        bgColor,
        eyeColor,
        dotColor,
        bodyPattern,
        cornerEyePattern,
        cornerEyeDotPattern,
        level: errorLevel,
        hideLogo: !showLogo,
        logo: logoUrl || QRDX_LOGO,
      });

      const dataUrl = (await getQRAsCanvas(qrData, "image/png")) as string;

      // const thumbData = getQRData({
      //   value: url,
      //   size: 200,
      //   fgColor,
      //   bgColor,
      //   eyeColor,
      //   dotColor,
      //   bodyPattern,
      //   cornerEyePattern,
      //   cornerEyeDotPattern,
      //   level: errorLevel,
      //   hideLogo: true,
      // });
      // const thumbnailUrl = (await getQRAsCanvas(
      //   thumbData,
      //   "image/png"
      // )) as string;

      // const asset = await upload({
      //   type: "image",
      //   url: dataUrl,
      //   mimeType: "image/png",
      //   thumbnailUrl,
      //   aiDisclosure: "none",
      //   width: 1024,
      //   height: 1024,
      //   name: `QRdx - ${url.slice(0, 40)}`,
      // });

      // const { ref } = asset;
      // await asset.whenUploaded();

      await addElement({
        type: "image",
        dataUrl,
        altText: {
          text: intl.formatMessage(
            {
              defaultMessage: "QR code generated by {brand}",
              description:
                "Alt text, read by screen readers, for the QR code image this app adds to the user's design. {brand} is the product name QRdx, which is not translated.",
            },
            { brand: BRAND }
          ),
          decorative: false,
        },
      });
    } catch (err) {
      // The error's own text isn't translated, so the user sees our message
      // and the details go to the console.
      console.error(err);
      setAddFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.scrollContainer}>
      <Rows spacing="2u">
        <FormField
          control={(props) => (
            <TextInput
              {...props}
              onChange={setUrl}
              placeholder={URL_EXAMPLE}
              value={url}
            />
          )}
          label={
            <FormattedMessage
              defaultMessage="URL or Text"
              description="Label for the text field at the top of the app where the user types the web address or text that the QR code will contain."
            />
          }
        />

        {/* Live Preview */}
        <div className={styles.previewContainer}>
          {url ? (
            <QRCode
              bgColor={bgColor}
              bodyPattern={bodyPattern}
              cornerEyeDotPattern={cornerEyeDotPattern}
              cornerEyePattern={cornerEyePattern}
              dotColor={dotColor}
              eyeColor={eyeColor}
              fgColor={fgColor}
              hideLogo={!showLogo}
              level={errorLevel}
              logo={logoUrl || QRDX_LOGO}
              size={220}
              value={url}
            />
          ) : (
            <Text size="small" tone="tertiary">
              <FormattedMessage
                defaultMessage="Enter a URL to preview your QR code"
                description="Shown in the empty preview box when the URL or Text field is empty. Asks the user to type an address so the QR code preview appears."
              />
            </Text>
          )}
        </div>

        {/* Dot Patterns */}
        <HorizontalPicker
          label={
            <FormattedMessage
              defaultMessage="Dot Pattern"
              description="Label above a row of choices for the shape of the small dots that make up the body of the QR code."
            />
          }
          onChange={(v) => setBodyPattern(v as BodyPattern)}
          options={BODY_PATTERNS}
          renderCard={(p) => (
            <QRCode
              bodyPattern={p}
              hideLogo
              level="Q"
              size={64}
              value={PREVIEW_VALUE}
            />
          )}
          value={bodyPattern}
        />

        {/* Eye Patterns */}
        <HorizontalPicker
          label={
            <FormattedMessage
              defaultMessage="Eye Pattern"
              description="Label above a row of choices for the shape of the three large square markers (the eyes) in the corners of the QR code."
            />
          }
          onChange={(v) => setCornerEyePattern(v as CornerEyePattern)}
          options={EYE_PATTERNS}
          renderCard={(p) => (
            <QRCode
              cornerEyePattern={p}
              hideLogo
              level="Q"
              size={64}
              value={PREVIEW_VALUE}
            />
          )}
          value={cornerEyePattern}
        />

        {/* Eye Dot Patterns */}
        <HorizontalPicker
          label={
            <FormattedMessage
              defaultMessage="Eye Dot Pattern"
              description="Label above a row of choices for the shape of the solid center inside each of the three corner markers (the eyes) of the QR code."
            />
          }
          onChange={(v) => setCornerEyeDotPattern(v as CornerEyeDotPattern)}
          options={EYE_DOT_PATTERNS}
          renderCard={(p) => (
            <QRCode
              cornerEyeDotPattern={p}
              hideLogo
              level="Q"
              size={64}
              value={PREVIEW_VALUE}
            />
          )}
          value={cornerEyeDotPattern}
        />

        {/* Colors — Brand Kit aware via openColorSelector */}
        <FormField
          control={(_props) => (
            <div className={styles.colorRow}>
              <Swatch
                fill={[fgColor]}
                onClick={async (e) => {
                  const anchor = (
                    e.currentTarget as HTMLElement
                  ).getBoundingClientRect();
                  await openColorSelector(anchor, {
                    scopes: ["solid"],
                    selectedColor: { type: "solid", hexString: fgColor },
                    onColorSelect: (ev) => {
                      if (ev.selection.type === "solid") {
                        setFgColor(ev.selection.hexString);
                      }
                    },
                  });
                }}
              />
              <Text size="small">{fgColor.toUpperCase()}</Text>
            </div>
          )}
          label={
            <FormattedMessage
              defaultMessage="Foreground"
              description="Label for the color swatch that sets the color of the QR code's dots. Next to it is the color's hex value."
            />
          }
        />

        <FormField
          control={(_props) => (
            <div className={styles.colorRow}>
              <Swatch
                fill={[bgColor]}
                onClick={async (e) => {
                  const anchor = (
                    e.currentTarget as HTMLElement
                  ).getBoundingClientRect();
                  await openColorSelector(anchor, {
                    scopes: ["solid"],
                    selectedColor: { type: "solid", hexString: bgColor },
                    onColorSelect: (ev) => {
                      if (ev.selection.type === "solid") {
                        setBgColor(ev.selection.hexString);
                      }
                    },
                  });
                }}
              />
              <Text size="small">{bgColor.toUpperCase()}</Text>
            </div>
          )}
          label={
            <FormattedMessage
              defaultMessage="Background"
              description="Label for the color swatch that sets the background color behind the QR code. Next to it is the color's hex value."
            />
          }
        />

        <FormField
          control={(_props) => (
            <div className={styles.colorRow}>
              <Swatch
                fill={[eyeColor]}
                onClick={async (e) => {
                  const anchor = (
                    e.currentTarget as HTMLElement
                  ).getBoundingClientRect();
                  await openColorSelector(anchor, {
                    scopes: ["solid"],
                    selectedColor: { type: "solid", hexString: eyeColor },
                    onColorSelect: (ev) => {
                      if (ev.selection.type === "solid") {
                        setEyeColor(ev.selection.hexString);
                      }
                    },
                  });
                }}
              />
              <Text size="small">{eyeColor.toUpperCase()}</Text>
            </div>
          )}
          label={
            <FormattedMessage
              defaultMessage="Eye Color"
              description="Label for the color swatch that sets the color of the three large square markers (the eyes) in the corners of the QR code."
            />
          }
        />

        <FormField
          control={(_props) => (
            <div className={styles.colorRow}>
              <Swatch
                fill={[dotColor]}
                onClick={async (e) => {
                  const anchor = (
                    e.currentTarget as HTMLElement
                  ).getBoundingClientRect();
                  await openColorSelector(anchor, {
                    scopes: ["solid"],
                    selectedColor: { type: "solid", hexString: dotColor },
                    onColorSelect: (ev) => {
                      if (ev.selection.type === "solid") {
                        setDotColor(ev.selection.hexString);
                      }
                    },
                  });
                }}
              />
              <Text size="small">{dotColor.toUpperCase()}</Text>
            </div>
          )}
          label={
            <FormattedMessage
              defaultMessage="Dot Color"
              description="Label for the color swatch that sets the color of the solid dot inside each of the three corner markers (the eyes) of the QR code."
            />
          }
        />

        {/* Error Correction */}
        <FormField
          control={(props) => (
            <SegmentedControl
              {...props}
              onChange={(v) => setErrorLevel(v as ErrorLevel)}
              options={ERROR_LEVELS.map((l) => ({ label: l, value: l }))}
              value={errorLevel}
            />
          )}
          label={
            <FormattedMessage
              defaultMessage="Error Correction"
              description="Label for the choice of QR code error correction level, shown as the letters L, M, Q and H (not translated). A higher level lets the code still scan when part of it is covered or damaged."
            />
          }
        />

        {/* Logo */}
        <FormField
          control={(props) => (
            <SegmentedControl
              {...props}
              onChange={(v) => setShowLogo(v === "on")}
              options={[
                {
                  label: (
                    <FormattedMessage
                      defaultMessage="Off"
                      description="Option in the Logo setting that leaves the middle of the QR code without a logo. The opposite of On."
                    />
                  ),
                  value: "off",
                },
                {
                  label: (
                    <FormattedMessage
                      defaultMessage="On"
                      description="Option in the Logo setting that puts a logo image in the middle of the QR code. The opposite of Off."
                    />
                  ),
                  value: "on",
                },
              ]}
              value={showLogo ? "on" : "off"}
            />
          )}
          label={
            <FormattedMessage
              defaultMessage="Logo"
              description="Label (a noun) for the setting that turns a logo image in the middle of the QR code on or off."
            />
          }
        />

        {showLogo && (
          <FormField
            control={(props) => (
              <TextInput
                {...props}
                onChange={setLogoUrl}
                placeholder={LOGO_URL_EXAMPLE}
                value={logoUrl}
              />
            )}
            description={intl.formatMessage(
              {
                defaultMessage: "Leave empty to use the {brand} logo.",
                description:
                  "Help text under the Logo URL field. If the user doesn't enter an image address, the app's own logo goes in the middle of the QR code. {brand} is the product name QRdx, which is not translated.",
              },
              { brand: BRAND }
            )}
            label={
              <FormattedMessage
                defaultMessage="Logo URL"
                description="Label for the text field where the user enters the web address of an image to use as the logo in the middle of the QR code."
              />
            }
          />
        )}

        {addFailed && (
          <Text size="small" tone="critical">
            <FormattedMessage
              defaultMessage="Couldn't add the QR code to your design. Please try again."
              description="Error shown above the Add to Design button when adding the QR code image to the user's Canva design fails."
            />
          </Text>
        )}

        <Button
          disabled={!(url.trim() && addElement) || isLoading}
          onClick={addToDesign}
          stretch
          variant="primary"
        >
          {isLoading
            ? intl.formatMessage({
                defaultMessage: "Adding to Design...",
                description:
                  "Text of the main button while the QR code image is being added to the user's Canva design.",
              })
            : intl.formatMessage({
                defaultMessage: "Add to Design",
                description:
                  "Text of the main button (a verb phrase) that adds the QR code as an image to the user's Canva design.",
              })}
        </Button>

        <Text alignment="center" size="small" tone="tertiary">
          <Link
            href={playgroundLink(url)}
            // Canva opens outside links itself, after asking the user.
            requestOpenExternalUrl={() =>
              requestOpenExternalUrl({ url: playgroundLink(url) })
            }
          >
            <FormattedMessage
              defaultMessage="More options in the {brand} playground"
              description="Link at the bottom of the app that opens the full QR code editor (the playground) on the QRdx website, after Canva asks the user to confirm. {brand} is the product name QRdx, which is not translated."
              values={{ brand: BRAND }}
            />
          </Link>
        </Text>
      </Rows>
    </div>
  );
};
