import { Buffer } from 'node:buffer';
import type { BlobObject } from '@/lib/graphql';
import {
    readWalrusBlob,
    readWalrusFile,
    getFileText,
    getFileIdentifier,
    getFileTags,
} from '@/lib/walrus';
import type { createWalrusClient } from '@/lib/walrus';
import type { WalrusFile } from '@mysten/walrus';
import {
    RAGManager,
    type RAGDocumentMetadata,
    type AddDocumentOptions,
} from './rag-manager';

export interface WalrusIngestOptions extends AddDocumentOptions {
    metadata?: RAGDocumentMetadata;
}

export interface WalrusBlobIngestResult {
    blobId: string;
    objectAddress?: string;
    documentId: string | null;
    error?: string;
}

type WalrusClient = ReturnType<typeof createWalrusClient>;

export class WalrusRAGManager extends RAGManager {
    /**
     * Checks if a document with the given blobId already exists in the store.
     */
    async hasBlob(blobId: string): Promise<boolean> {
        await this.initialize();
        // Iterate through documents to check metadata
        // RAGManager keeps documents in memory after load, so this is fast for small-medium datasets
        // Ideally RAGManager should expose a more efficient query method
        for (const doc of this.documents.values()) {
            if (doc.metadata && 
                typeof doc.metadata.walrus === 'object' && 
                doc.metadata.walrus !== null &&
                (doc.metadata.walrus as any).blobId === blobId
            ) {
                return true;
            }
        }
        return false;
    }

    async ingestBlobById(
        client: WalrusClient,
        blobId: string,
        options?: WalrusIngestOptions
    ): Promise<string | null> {
        // Optimization: Check if already exists before downloading
        if (await this.hasBlob(blobId)) {
            console.log(`[RAG] Blob ${blobId} already ingested. Skipping download.`);
            return null; 
        }

        const blob = await readWalrusBlob(client, blobId);
        const content = this.decodeBlob(blob);
        const metadata = this.buildWalrusMetadata('blob', { blobId }, options?.metadata);
        return this.addDocument(content, metadata, options);
    }

    async ingestBlobObjects(
        client: WalrusClient,
        blobObjects: BlobObject[],
        options?: WalrusIngestOptions
    ): Promise<WalrusBlobIngestResult[]> {
        const results: WalrusBlobIngestResult[] = [];

        for (const blobObject of blobObjects) {
            const combinedMetadata = this.mergeMetadata(options?.metadata, {
                walrusObjectAddress: blobObject.address,
                walrusRegisteredEpoch: blobObject.registeredEpoch,
                walrusSize: blobObject.size,
                walrusDeletable: blobObject.deletable,
            });

            try {
                const documentId = await this.ingestBlobById(
                    client,
                    blobObject.blobId,
                    {
                        ...options,
                        metadata: combinedMetadata,
                    }
                );

                results.push({
                    blobId: blobObject.blobId,
                    objectAddress: blobObject.address,
                    documentId,
                });
            } catch (error: unknown) {
                const message = error instanceof Error
                    ? error.message
                    : 'Unknown Walrus blob ingestion error';

                results.push({
                    blobId: blobObject.blobId,
                    objectAddress: blobObject.address,
                    documentId: null,
                    error: message,
                });
            }
        }

        return results;
    }

    async ingestFileById(
        client: WalrusClient,
        fileId: string,
        options?: WalrusIngestOptions
    ): Promise<string | null> {
        const file = await readWalrusFile(client, fileId);
        return this.ingestWalrusFile(file, fileId, options);
    }

    async ingestWalrusFile(
        file: WalrusFile,
        fileId: string,
        options?: WalrusIngestOptions
    ): Promise<string | null> {
        const content = await getFileText(file);
        const identifier = await getFileIdentifier(file);
        const tags = await getFileTags(file);
        const metadata = this.buildWalrusMetadata(
            'file',
            {
                fileId,
                identifier,
                tags,
            },
            options?.metadata
        );

        return this.addDocument(content, metadata, options);
    }

    private decodeBlob(blob: Uint8Array): string {
        try {
            const decoder = new TextDecoder();
            return decoder.decode(blob);
        } catch {
            return Buffer.from(blob).toString('base64');
        }
    }

    private buildWalrusMetadata(
        kind: 'blob' | 'file',
        walrusDetails: Record<string, unknown>,
        metadata?: RAGDocumentMetadata
    ): RAGDocumentMetadata {
        const resolvedMetadata = metadata
            ? { ...metadata }
            : {};

        if (typeof resolvedMetadata.source !== 'string') {
            resolvedMetadata.source = 'walrus';
        }

        resolvedMetadata.walrus = {
            ...(typeof resolvedMetadata.walrus === 'object' && resolvedMetadata.walrus !== null
                ? resolvedMetadata.walrus
                : {}),
            kind,
            ...walrusDetails,
        };

        return resolvedMetadata;
    }

    private mergeMetadata(
        base?: RAGDocumentMetadata,
        extras?: RAGDocumentMetadata
    ): RAGDocumentMetadata | undefined {
        if (!base && !extras) {
            return undefined;
        }

        if (base && extras) {
            return {
                ...base,
                ...extras,
            };
        }

        return base ? { ...base } : { ...extras };
    }
}
