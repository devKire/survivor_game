import type { NextConfig } from "next";
const config: NextConfig = {
  // Public only. Freeze even an absent value as "" so the server diagnostic and
  // browser bundle agree; runtime env cannot repair a missing frontend build var.
  env: {
    NEXT_PUBLIC_REALTIME_URL:
      process.env.NEXT_PUBLIC_REALTIME_URL?.trim() ?? "",
  },
  turbopack: { root: process.cwd() },
  allowedDevOrigins: ["127.0.0.1"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
