import { pipeline, env } from '@xenova/transformers';

// Configuration for Vercel / Serverless environments
env.allowLocalModels = false;
env.useBrowserCache = false;
// On Vercel, only /tmp is writable
if (process.env.VERCEL) {
    env.cacheDir = '/tmp/.transformers_cache';
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
        const loadedPipeline = await pipeline('feature-extraction', this.embeddingModel);
        this.embedder = loadedPipeline as EmbeddingPipeline;
    }
}

