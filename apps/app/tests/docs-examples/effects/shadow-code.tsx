import { QRCode } from "qrdx";

export function ShadowCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      bodyPattern="rounded"
      shadow={{ dx: 0.2, dy: 0.2, opacity: 0.3 }}
    />
  );
}
