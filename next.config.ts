import path from 'node:path';
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  transpilePackages: ['@xenova/transformers', 'onnxruntime-web'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }

    // Force WASM backend by routing native binding requests to our shim
    const onnxShimPath = path.resolve(__dirname, 'lib/shims/onnxruntime-node.ts');
    const xenovaBackendShim = path.resolve(__dirname, 'lib/shims/xenova-backend-onnx.ts');
    const xenovaImageShim = path.resolve(__dirname, 'lib/shims/xenova-image.ts');
    config.resolve.alias = {
      ...config.resolve.alias,
      'onnxruntime-node': onnxShimPath,
      '@xenova/transformers/src/backends/onnx.js': xenovaBackendShim,
      '@xenova/transformers/src/utils/image.js': xenovaImageShim,
    };
    
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
  // Ensure WASM files and binary dependencies are not processed during SSR bundling
  // Removed @xenova/transformers and onnxruntime-node to allow webpack alias to strip native bindings
  serverExternalPackages: ['@mysten/walrus', 'sharp'],
};

export default nextConfig;
