import { QRCode } from "qrdx";

export function DotRingCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      bodyPattern="circle-large"
      frame={{
        style: "dot-ring",
        text: "Scan for the menu",
        secondaryText: "",
        color: "#1e3a8a",
        textColor: "#fde047",
      }}
    />
  );
}
