import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy, from Privy's recommended base
 * (docs.privy.io/security/implementation-guide/content-security-policy), adapted to this app:
 *  - script-src needs 'unsafe-inline': Next.js App Router streams inline <script> tags.
 *    Nonces would remove it but force every page to render dynamically.
 *  - img-src / media-src allow any https: source. Operators can set artwork and gallery
 *    media from any https link (lib/theme.ts), plus the Pinata gateway and picsum samples.
 *  - Wallet login: WalletConnect relay/verify and Coinbase (Base Account) endpoints.
 *  - Dev only: 'unsafe-eval' for React's dev tooling and Fast Refresh.
 *
 * Ships as Content-Security-Policy-Report-Only until CSP_ENFORCE=true, so violations show
 * in the browser console without breaking anything. Check sign-in, wallet login, claim and
 * the operator console on the live site, then set CSP_ENFORCE=true on Vercel.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org",
  "frame-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com https://keys.coinbase.com",
  [
    "connect-src 'self'",
    "https://auth.privy.io",
    "https://*.rpc.privy.systems",
    "wss://relay.walletconnect.com",
    "wss://relay.walletconnect.org",
    "https://explorer-api.walletconnect.com",
    "wss://www.walletlink.org",
    "https://*.coinbase.com",
    "https://mainnet.base.org",
    "https://sepolia.base.org",
  ].join(" "),
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const enforce = process.env.CSP_ENFORCE === "true";

const securityHeaders = [
  { key: enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: csp },
  // Never framed (clickjacking); frame-ancestors covers browsers that enforce CSP.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Tilt (holographic artwork) needs motion sensors on this site; nothing needs camera, mic or location.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=(), accelerometer=(self), gyroscope=(self)",
  },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
