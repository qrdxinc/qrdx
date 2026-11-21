import { QRCode } from "qrdx";

const brand = {
  type: "linear" as const,
  angle: 45,
  stops: [
    { color: "#1d4ed8", offset: 0 },
    { color: "#db2777", offset: 100 },
  ],
};

export function EyeGradientCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      fgColor={brand}
      eyeColor={brand}
      dotColor={brand}
      eyeGradient="code"
    />
  );
}
