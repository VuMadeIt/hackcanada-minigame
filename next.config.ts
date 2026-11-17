import type { NextConfig } from "next";

// `npm run build:demo` makes a static, browser-only copy for GitHub Pages (see scripts/build-demo.sh)
const demo = process.env.NEXT_PUBLIC_DEMO === "1";

const nextConfig: NextConfig = demo
  ? {
      output: "export",
      distDir: ".next-demo",
      basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
      images: { unoptimized: true },
      trailingSlash: true,
    }
  : {};

export default nextConfig;
