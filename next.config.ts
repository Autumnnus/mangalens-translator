import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "1024mb",
    },
    middlewareClientMaxBodySize: "1024mb",
  },
};

export default nextConfig;
