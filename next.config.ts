import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/WASM runtimes are loaded at run time, not bundled.
  serverExternalPackages: ["sharp", "onnxruntime-web"],
  experimental: {
    serverActions: {
      bodySizeLimit: "1024mb",
    },
    proxyClientMaxBodySize: "1024mb",
  },
};

export default nextConfig;
