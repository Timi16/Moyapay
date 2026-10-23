"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** A real QR code of `value`, drawn as an SVG in the design's ink colour. */
export function Qr({ value, size = 150 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(value, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#12102A", light: "#FFFFFF" } })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(null));
    return () => {
      live = false;
    };
  }, [value]);
  return (
    <div
      role="img"
      aria-label="QR code for the pay link"
      style={{ flex: "0 0 auto", width: size, height: size, padding: 12, borderRadius: 18, border: "1px solid #ECEAF5", background: "#FFFFFF" }}
    >
      {svg ? (
        // The SVG comes from the qrcode library, built from our own pay link.
        <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="skel" style={{ width: "100%", height: "100%" }} />
      )}
    </div>
  );
}
