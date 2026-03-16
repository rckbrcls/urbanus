import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@urbanus/geo", "@urbanus/constants", "@urbanus/utils"],
};

export default nextConfig;
