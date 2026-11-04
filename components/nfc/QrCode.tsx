"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** A QR code for `url`, drawn in the browser (dark modules on white, with a quiet zone so it scans). */
export default function QrCode({ url, className = "" }: { url: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 2, width: 640, errorCorrectionLevel: "M", color: { dark: "#0A0A0A", light: "#FFFFFF" } })
      .then((d) => !cancelled && setSrc(d))
      .catch(() => !cancelled && setSrc(null));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return src ? (
    <img src={src} alt={`QR code for ${url}`} className={`[image-rendering:pixelated] ${className}`} />
  ) : (
    <div className={`animate-pulse bg-white/80 ${className}`} />
  );
}
