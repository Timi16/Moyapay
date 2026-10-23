import type { NextConfig } from "next";

// The browser only ever talks to this origin: /api/v1/* is proxied to the MoyaPay API, so the
// session cookie is first-party and the API's Origin check sees the web app's own origin.
const API_ORIGIN = (process.env.API_ORIGIN ?? "http://127.0.0.1:4200").replace(/\/$/, "");

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@moyapay/shared"],
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default config;
