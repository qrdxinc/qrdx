import { QRCode } from "qrdx";

export function HaloCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      margin={4}
      halo={{ color: "#fde68a", width: 0.3 }}
    />
  );
}
