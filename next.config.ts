import type { NextConfig } from "next";
import {
  PRIVATE_NO_STORE_HEADERS,
  productionSecurityHeaders,
} from "./src/security/headers";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Allows the existing 10 MB CSV limit plus multipart form overhead.
      bodySizeLimit: "11mb",
    },
  },
  async headers() {
    const security = productionSecurityHeaders(process.env.NODE_ENV === "production");
    const privateNoStoreSources = [
      "/login",
      "/forgot-password",
      "/reset-password",
      "/accept-invitation",
      "/admin/:path*",
      "/api/:path*",
    ];
    return [
      { source: "/:path*", headers: security },
      ...privateNoStoreSources.map((source) => ({
        source,
        headers: PRIVATE_NO_STORE_HEADERS,
      })),
    ];
  },
};

export default nextConfig;
