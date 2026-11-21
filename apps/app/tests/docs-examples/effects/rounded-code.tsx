import { QRCode } from "qrdx";

export function RoundedCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      margin={4}
      bgColor="#fff7ed"
      bgRadius={0.2}
      backdrop="#1e3a8a"
    />
  );
}
