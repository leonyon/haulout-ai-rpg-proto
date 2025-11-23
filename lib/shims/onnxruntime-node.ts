/**
 * Shim to replace the native `onnxruntime-node` dependency with the WASM-based
 * `onnxruntime-web` build so that Transformers.js can run in serverless
 * environments (e.g. Vercel) without native binaries.
 */
import * as ortWeb from 'onnxruntime-web';

// Re-export everything so the public surface matches `onnxruntime-node`.
export * from 'onnxruntime-web';

const ort = (ortWeb as unknown as { default?: typeof ortWeb }).default ?? ortWeb;

export default ort;

