import { pipeline, env } from '@xenova/transformers';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Configuration for Vercel / Serverless environments
env.allowLocalModels = false;
env.useBrowserCache = false;
// On Vercel, only /tmp is writable
if (process.env.VERCEL) {
    env.cacheDir = '/tmp/.transformers_cache';
}
const TRANSFORMERS_VERSION = process.env.NEXT_PUBLIC_TRANSFORMERS_VERSION ?? '2.17.2';
const WASM_CDN_BASE = `https://cdn.jsdelivr.net/npm/@xenova/transformers@${TRANSFORMERS_VERSION}/dist/`;
const WASM_FILENAMES = [
    'ort-wasm-simd.wasm',
    'ort-wasm-simd-threaded.wasm',
    'ort-wasm.wasm',
    'ort-wasm-threaded.wasm',
];
const WASM_CACHE_DIR = process.env.VERCEL
    ? '/tmp/transformers-wasm'
    : path.join(process.cwd(), '.cache', 'transformers-wasm');
let wasmSetupPromise: Promise<string> | null = null;

async function ensureWasmArtifacts(): Promise<string> {
    await fs.mkdir(WASM_CACHE_DIR, { recursive: true });
    await Promise.all(WASM_FILENAMES.map(async (filename) => {
        const targetPath = path.join(WASM_CACHE_DIR, filename);
        try {
            await fs.access(targetPath);
            return;
        } catch {
            // continue to download
        }
        const response = await fetch(`${WASM_CDN_BASE}${filename}`);
        if (!response.ok) {
            throw new Error(`Failed to download ${filename} (${response.status} ${response.statusText})`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(targetPath, buffer);
    }));
    return WASM_CACHE_DIR;
}

export type EmbeddingVector = number[];

export interface EmbeddingManagerOptions {
    model?: string;
}

type EmbeddingPipeline = (
    input: string,
    options?: Record<string, unknown>
) => Promise<{ data: Float32Array | number[] }>;

export class EmbeddingManager {
    private embedder: EmbeddingPipeline | null;

    private embeddingModel: string;

    private loadingPromise: Promise<void> | null;

    constructor(options?: EmbeddingManagerOptions) {
        this.embeddingModel = options?.model ?? 'Xenova/all-MiniLM-L6-v2';
        this.embedder = null;
        this.loadingPromise = null;
    }

    async initialize(): Promise<void> {
        if (this.embedder) {
            return;
        }

        if (!this.loadingPromise) {
            this.loadingPromise = this.loadEmbedder();
        }

        await this.loadingPromise;
    }

    async embed(text: string): Promise<EmbeddingVector> {
        await this.initialize();

        if (!this.embedder) {
            throw new Error('Embedding model failed to load');
        }

        const output = await this.embedder(text, { pooling: 'mean', normalize: true });
        const rawData = output.data;

        if (Array.isArray(rawData)) {
            return rawData.slice();
        }

        return Array.from(rawData);
    }

    cosineSimilarity(vecA: EmbeddingVector, vecB: EmbeddingVector): number {
        if (vecA.length !== vecB.length) {
            throw new Error('Embedding vectors must have the same length');
        }

        let dotProduct = 0;
        let magnitudeA = 0;
        let magnitudeB = 0;

        for (let i = 0; i < vecA.length; i += 1) {
            const valueA = vecA[i];
            const valueB = vecB[i];
            dotProduct += valueA * valueB;
            magnitudeA += valueA * valueA;
            magnitudeB += valueB * valueB;
        }

        const denominator = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);

        if (denominator === 0) {
            return 0;
        }

        return dotProduct / denominator;
    }

    private async loadEmbedder(): Promise<void> {
        if (!wasmSetupPromise) {
            wasmSetupPromise = ensureWasmArtifacts();
        }
        const wasmPath = await wasmSetupPromise;
        if (env.backends?.onnx?.wasm) {
            const normalizedPath = wasmPath.endsWith(path.sep)
                ? wasmPath
                : `${wasmPath}${path.sep}`;
            env.backends.onnx.wasm.wasmPaths = normalizedPath;
            env.backends.onnx.wasm.numThreads = 1;
        }
        const loadedPipeline = await pipeline('feature-extraction', this.embeddingModel);
        this.embedder = loadedPipeline as EmbeddingPipeline;
    }
}

