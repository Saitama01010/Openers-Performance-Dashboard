import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Allows the existing 10 MB CSV limit plus multipart form overhead.
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
