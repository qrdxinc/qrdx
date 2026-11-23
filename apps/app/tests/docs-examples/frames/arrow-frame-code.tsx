import { QRCode } from "qrdx";

export function ArrowFrameCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      fgColor="#1a56db"
      frame={{ style: "arrow", color: "#1a56db" }}
    />
  );
}
