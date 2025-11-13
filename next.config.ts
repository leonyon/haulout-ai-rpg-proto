import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    
    // Handle WASM files
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
      generator: {
        filename: 'static/wasm/[name].[hash][ext]',
      },
    });
    
    return config;
  },
  // Turbopack configuration (empty for now - webpack handles WASM)
  turbopack: {},
  // Ensure WASM files are not processed during SSR
  serverExternalPackages: ['@mysten/walrus'],
};

export default nextConfig;
