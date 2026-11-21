import { QRCode } from "qrdx";

export function HaloCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      margin={4}
      bgColor="transparent"
      halo={{ color: "#ffffff", width: 0.3 }}
    />
  );
}
