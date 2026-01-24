import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "1024mb",
    },
    proxyClientMaxBodySize: "1024mb",
  },
};

export default nextConfig;
