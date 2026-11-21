import { QRCode } from "qrdx";

export function EyeShapesCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      cornerEyePattern="rounded"
      cornerEyeDotPattern="rounded"
      eyeShapes={{
        topLeft: { outer: "leaf", inner: "leaf" },
        bottomLeft: { inner: "dots" },
      }}
    />
  );
}
