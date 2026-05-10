import type { NextConfig } from "next";

// Security headers applied to every response. We deliberately skip a strict
// Content-Security-Policy here because Next.js inlines styles + tiny scripts
// and a strict CSP would need per-request nonces. The headers below are
// the cheap, no-risk wins.
const securityHeaders = [
  // Stops the browser from sniffing MIME types (defends against some
  // content-type confusion XSS).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Prevents the app from being framed (clickjacking defense).
  { key: "X-Frame-Options", value: "DENY" },
  // Trim down what we leak in the Referer header on cross-origin nav.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Strict HSTS once we're on HTTPS in prod (Vercel does this anyway, but
  // explicit is better). Only effective over HTTPS — local dev is unaffected.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Disable browser features we never use.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
