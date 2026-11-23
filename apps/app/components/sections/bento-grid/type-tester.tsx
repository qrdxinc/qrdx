"use client";

import { BUILT_IN_FRAMES, QRCodeSVG } from "qrdx";
import { useEffect, useState } from "react";

/** The built-in frames, one after another. */
export function TypeTester() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex(Math.floor(Math.random() * BUILT_IN_FRAMES.length));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const frame = BUILT_IN_FRAMES[index] ?? BUILT_IN_FRAMES[0];

  return (
    <div className="flex items-center justify-center h-full">
      <QRCodeSVG
        bgColor="transparent"
        bodyPattern="circle"
        cornerEyeDotPattern="circle"
        cornerEyePattern="circle"
        dotColor="#4D5053"
        eyeColor="#4D5053"
        fgColor="#4D5053"
        frame={frame ? { style: frame.style, color: "#4D5053" } : undefined}
        size={150}
        style={{ maxHeight: 180, maxWidth: "100%" }}
        value="https://www.google.com"
      />
    </div>
  );
}
