import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { EmbeddingManager, type EmbeddingVector } from './embedding';

export interface RAGDocumentMetadata {
    [key: string]: unknown;
}

export interface RAGDocument {
    id: string;
    content: string;
    metadata: RAGDocumentMetadata;
}

export interface RAGSearchResult {
    id: string;
    similarity: number;
    document: RAGDocument;
}

export interface RAGManagerOptions {
    storagePath?: string;
    embeddingManager?: EmbeddingManager;
}

export interface AddDocumentOptions {
    preventDuplicates?: boolean;
    duplicateThreshold?: number;
}

interface RAGStorePayload {
    documents: [string, RAGDocument][];
    vectors: [string, EmbeddingVector][];
}

export class RAGManager {
    private readonly storagePath: string;

    protected readonly embeddingManager: EmbeddingManager;

    private vectorStore: Map<string, EmbeddingVector>;

    private documents: Map<string, RAGDocument>;

    private storeLoaded: boolean;

    constructor(options?: RAGManagerOptions) {
        const defaultPath = path.join(process.cwd(), '.cache', 'rag', 'store.json');
        this.storagePath = options?.storagePath ?? defaultPath;
        this.embeddingManager = options?.embeddingManager ?? new EmbeddingManager();
        this.vectorStore = new Map<string, EmbeddingVector>();
        this.documents = new Map<string, RAGDocument>();
        this.storeLoaded = false;
    }

    async initialize(): Promise<void> {
        await Promise.all([this.ensureStoreLoaded(), this.embeddingManager.initialize()]);
    }

    async addDocument(
        content: string,
        metadata?: RAGDocumentMetadata,
        options?: AddDocumentOptions
    ): Promise<string | null> {
        const trimmedContent = content.trim();

        if (!trimmedContent) {
            return null;
        }

        await this.initialize();

        const resolvedOptions = this.resolveAddOptions(options);

        if (resolvedOptions.preventDuplicates) {
            const duplicates = await this.search(
                trimmedContent,
                1,
                resolvedOptions.duplicateThreshold
            );

            if (duplicates.length > 0) {
                return null;
            }
        }

        const embedding = await this.embeddingManager.embed(trimmedContent);
        const documentId = randomUUID();
        const documentMetadata = this.withMetadataDefaults(metadata);

        const document: RAGDocument = {
            id: documentId,
            content: trimmedContent,
            metadata: documentMetadata,
        };

        this.documents.set(documentId, document);
        this.vectorStore.set(documentId, embedding);
        await this.saveVectorStore();

        return documentId;
    }

    async search(query: string, limit = 10, threshold = 0.7): Promise<RAGSearchResult[]> {
        await this.initialize();
        const queryEmbedding = await this.embeddingManager.embed(query);
        const scoredResults: RAGSearchResult[] = [];

        for (const [id, embedding] of this.vectorStore.entries()) {
            const similarity = this.embeddingManager.cosineSimilarity(queryEmbedding, embedding);

            const document = this.documents.get(id);

            if (document) {
                scoredResults.push({ id, similarity, document });
            }
        }

        const filteredResults = scoredResults.filter(function filterByThreshold(result) {
            return result.similarity >= threshold;
        });

        const rankedResults = filteredResults.length > 0 ? filteredResults : scoredResults;

        rankedResults.sort(function sortBySimilarity(a, b) {
            return b.similarity - a.similarity;
        });

        return rankedResults.slice(0, limit);
    }

    async getCoreMemories(): Promise<RAGSearchResult[]> {
        await this.ensureStoreLoaded();
        const results: RAGSearchResult[] = [];

        for (const [id, document] of this.documents.entries()) {
            if (document.content && document.content.startsWith('Core:')) {
                results.push({
                    id,
                    similarity: 1,
                    document,
                });
            }
        }

        results.sort(function sortByTimestamp(a, b) {
            const valueA = typeof a.document.metadata.timestamp === 'string'
                ? a.document.metadata.timestamp
                : '';
            const valueB = typeof b.document.metadata.timestamp === 'string'
                ? b.document.metadata.timestamp
                : '';
            return valueB.localeCompare(valueA);
        });

        return results;
    }

    async wipe(): Promise<void> {
        await this.ensureStoreLoaded();
        this.documents.clear();
        this.vectorStore.clear();
        await this.saveVectorStore();
    }

    protected async ensureStoreLoaded(): Promise<void> {
        if (this.storeLoaded) {
            return;
        }

        await this.loadVectorStore();
        this.storeLoaded = true;
    }

    private async loadVectorStore(): Promise<void> {
        try {
            const data = await fs.readFile(this.storagePath, 'utf-8');
            const payload = JSON.parse(data) as RAGStorePayload;
            this.documents = new Map<string, RAGDocument>(payload.documents ?? []);
            this.vectorStore = new Map<string, EmbeddingVector>(payload.vectors ?? []);
        } catch (error: unknown) {
            const nodeError = error as NodeJS.ErrnoException;

            if (nodeError.code !== 'ENOENT') {
                throw error;
            }

            this.documents.clear();
            this.vectorStore.clear();
        }
    }

    private async saveVectorStore(): Promise<void> {
        const payload: RAGStorePayload = {
            documents: Array.from(this.documents.entries()),
            vectors: Array.from(this.vectorStore.entries()),
        };

        const directory = path.dirname(this.storagePath);
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(this.storagePath, JSON.stringify(payload, null, 2), 'utf-8');
    }

    private resolveAddOptions(options?: AddDocumentOptions): Required<AddDocumentOptions> {
        return {
            preventDuplicates: options?.preventDuplicates ?? true,
            duplicateThreshold: options?.duplicateThreshold ?? 0.8,
        };
    }

    private withMetadataDefaults(metadata?: RAGDocumentMetadata): RAGDocumentMetadata {
        const resolvedMetadata: RAGDocumentMetadata = metadata
            ? { ...metadata }
            : {};

        if (typeof resolvedMetadata.timestamp !== 'string') {
            resolvedMetadata.timestamp = new Date().toISOString();
        }

        if (typeof resolvedMetadata.type !== 'string') {
            resolvedMetadata.type = 'memory';
        }

        return resolvedMetadata;
    }
}

