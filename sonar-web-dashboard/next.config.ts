import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable source maps in dev — massive memory saver
  productionBrowserSourceMaps: false,

  // Webpack memory optimizations
  webpack: (config, { dev }) => {
    if (dev) {
      // Limit webpack's in-memory cache generations
      config.cache = {
        type: "memory",
        maxGenerations: 1,
      };

      // Reduce parallelism to save RAM
      config.parallelism = 1;
    }
    return config;
  },
};

export default nextConfig;
