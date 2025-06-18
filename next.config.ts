import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  env: {
    AUTH_URL: process.env.AUTH_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    BLOB_URL_BASE: process.env.BLOB_URL_BASE,
  },
  experimental: {
    serverActions: {},
    optimizeCss: true,
    inlineCss: true,
    scrollRestoration: true,
  },
  turbopack: {
    resolveAlias: {
      lodash: "",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: process.env.BLOB_URL_BASE!.replace(/^https?:\/\//, ""),
        pathname: "/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60,
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
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/(.*)\\.(css|js|woff2?|ico|png|jpg|jpeg|gif|webp|avif)$",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
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
