import * as ONNX_WEB from 'onnxruntime-web';

/**
 * Shimmed backend that forces Transformers.js to use the WASM runtime.
 * This avoids pulling in the native `onnxruntime-node` binary which
 * cannot be bundled on serverless platforms.
 */
const onnx = (ONNX_WEB as unknown as { default?: typeof ONNX_WEB }).default ?? ONNX_WEB;

export const ONNX = onnx;

export const executionProviders = ['wasm'] as const;

// Mirror the behavior of the upstream module for iOS SIMD quirks.
const navigatorExists = typeof navigator !== 'undefined';
if (
    navigatorExists &&
    /iP(hone|od|ad).+16_4.+AppleWebKit/.test(navigator.userAgent) &&
    onnx?.env?.wasm
) {
    onnx.env.wasm.simd = false;
}

