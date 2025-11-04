import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@aws-sdk/client-s3",
    "@aws-sdk/lib-storage",
    "@prisma/client",
  ],

  turbopack: {
    root: path.resolve(__dirname),
  },

  output: "standalone",

  webpack(config) {
    config.resolve.modules.push(path.resolve(__dirname, "src"));
    return config;
  },
};

export default nextConfig;
