"use client";

/* eslint-disable @next/next/no-img-element */
import { useId, useMemo } from "react";
import QRCode from "qrcode";

/**
 * A QR code for `url`, drawn as SVG in the card's ink: round data dots,
 * rounded finder eyes, a quiet zone so it scans, and optionally the
 * keystone's artwork in the middle. High error correction (30%) leaves room
 * for the artwork, which covers well under that.
 */
export default function QrCode({
  url,
  logo,
  ink = "#161616",
  className = "",
}: {
  url: string;
  /** Image shown in the centre (the keystone artwork). */
  logo?: string;
  ink?: string;
  className?: string;
}) {
  const clip = useId();
  const code = useMemo(() => {
    try {
      return QRCode.create(url || " ", { errorCorrectionLevel: logo ? "H" : "Q" });
    } catch {
      return null;
    }
  }, [url, logo]);
  if (!code) return <div className={className} />;

  const n = code.modules.size;
  const quiet = 2;
  const size = n + quiet * 2;
  // The centre logo covers about a fifth of the code, rounded to whole modules and kept odd so it centres.
  let logoModules = logo ? Math.floor(n * 0.22) : 0;
  if (logoModules && logoModules % 2 === 0) logoModules += 1;
  const logoStart = Math.floor((n - logoModules) / 2);

  const inFinder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const inLogo = (r: number, c: number) =>
    logoModules > 0 && r >= logoStart - 1 && r <= logoStart + logoModules && c >= logoStart - 1 && c <= logoStart + logoModules;

  const dots: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!code.modules.get(r, c) || inFinder(r, c) || inLogo(r, c)) continue;
      const cx = c + quiet + 0.5;
      const cy = r + quiet + 0.5;
      // A circle as a path keeps the whole pattern one element.
      dots.push(`M${cx - 0.42} ${cy}a0.42 0.42 0 1 0 0.84 0a0.42 0.42 0 1 0 -0.84 0`);
    }
  }

  const eyes = [
    [quiet, quiet],
    [quiet + n - 7, quiet],
    [quiet, quiet + n - 7],
  ];

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} role="img" aria-label={`QR code for ${url}`} shapeRendering="geometricPrecision">
      <rect width={size} height={size} fill="#FFFFFF" />
      <path d={dots.join("")} fill={ink} />
      {eyes.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x + 0.5} y={y + 0.5} width={6} height={6} rx={1.8} fill="none" stroke={ink} strokeWidth={1} />
          <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.9} fill={ink} />
        </g>
      ))}
      {logo && logoModules > 0 && (
        <>
          <clipPath id={clip}>
            <rect x={logoStart + quiet} y={logoStart + quiet} width={logoModules} height={logoModules} rx={1.2} />
          </clipPath>
          <image
            href={logo}
            x={logoStart + quiet}
            y={logoStart + quiet}
            width={logoModules}
            height={logoModules}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clip})`}
          />
        </>
      )}
    </svg>
  );
}
