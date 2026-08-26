import type { NextConfig } from "next";

// 'unsafe-inline' on script/style is a real compromise, not an oversight:
// Next.js's App Router injects inline scripts for hydration payloads, and
// a nonce-based CSP (the correct fix) needs middleware wiring this repo
// doesn't have yet. Everything else here is a genuine restriction — in
// particular connect-src 'self' actually matters, since the browser only
// ever calls this app's own API routes; Anthropic and Supabase are only
// ever called server-side.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];

    // The CSP above is production-only: Next's dev server (HMR, React
    // DevTools' eval()-based debugging) needs looser rules than the site
    // itself does, and a strict CSP in dev just breaks local development
    // for no security benefit — nothing dev-only is ever deployed.
    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "Content-Security-Policy", value: CSP });
    }

    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
