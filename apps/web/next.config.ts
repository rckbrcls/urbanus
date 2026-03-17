import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@urbanus/geo", "@urbanus/constants", "@urbanus/utils"],
  // react-map-gl internally references 'mapbox-gl' — redirect to maplibre-gl
  turbopack: {
    resolveAlias: {
      'mapbox-gl': 'maplibre-gl',
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'mapbox-gl': 'maplibre-gl',
    };
    return config;
  },
};

export default nextConfig;
