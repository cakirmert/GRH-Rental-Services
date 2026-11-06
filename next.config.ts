import type { NextConfig } from "next"
import { version } from "./package.json"

const imageOrigins = [process.env.BLOB_URL_BASE, process.env.IMAGE_DOMAIN && `https://${process.env.IMAGE_DOMAIN}`]
  .filter((value): value is string => Boolean(value))
  .map((value) => new URL(value))

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: version },
  agentRules: false,
  images: {
    localPatterns: [
      {
        pathname: "/**",
      },
    ],
    remotePatterns: [
      ...imageOrigins.map((url) => ({
        protocol: "https" as const,
        hostname: url.hostname,
        port: "",
        pathname: "/**",
      })),
    ],
    formats: ["image/webp"],
    minimumCacheTTL: 3600,
    maximumRedirects: 0,
    dangerouslyAllowSVG: false,
    contentDispositionType: "attachment",
    deviceSizes: [640, 750, 1080, 1200, 1920],
  },
  headers: async () => {
    return [
      {
        source: "/api/:path*",
        headers: [
          // Disable edge caching for API routes to ensure fresh data
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/(.*)\\.(css|js|woff2?|ico|png|jpg|jpeg|gif|webp|avif)$",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, must-revalidate" }],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ]
  },
  compress: true,
  reactStrictMode: true,
}

export default nextConfig
