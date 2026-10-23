import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
];

/**
 * AI 助理頁面額外加上 Content-Security-Policy：限制頁面只能連回本站、地圖會用到的 Nominatim，
 * 以及「瀏覽器直連」用的本機服務（localhost／127.0.0.1，例如 Ollama），
 * 就算出現 XSS 也無法把資料送到其他網站。Next.js 需要 inline script，所以保留 'unsafe-inline'。
 */
const aiCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://nominatim.openstreetmap.org http://localhost:* http://127.0.0.1:* https://localhost:* https://127.0.0.1:*${
    process.env.NODE_ENV === "development" ? " ws://localhost:* ws://127.0.0.1:*" : ""
  }`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["postgres"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/ai", headers: [{ key: "Content-Security-Policy", value: aiCsp }] },
      { source: "/ai/:path*", headers: [{ key: "Content-Security-Policy", value: aiCsp }] },
    ];
  },
};

export default nextConfig;
