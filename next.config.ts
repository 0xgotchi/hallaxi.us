import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@aws-sdk/client-s3"],
  },
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
