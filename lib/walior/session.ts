import path from 'node:path';
import { TextDecoder } from 'node:util';
import {
    createBasicWalrusClient,
    readWalrusBlob,
    readWalrusQuiltPatch,
    listQuiltPatches,
    createWalrusFileFromString,
    writeWalrusFile,
    deleteWalrusBlob,
    OWNER_KEYPAIR,
} from '@/lib/walrus';
import { WalrusRAGManager } from '@/lib/rag';
import { getAllBlobObjects } from '@/lib/graphql';
import type {
    WaliorIdentity,
    WaliorMemorySource,
    WaliorRegistryEntry,
    WaliorSessionSummaryInput,
    ChatMessage,
} from './types';
import { updateWaliorSummaryOnChain, getLatestWaliorSummary } from './onchain';

interface WaliorSessionState {
    waliorId: string;
    identityBlobId: string;
    identity: WaliorIdentity;
    ragManager: WalrusRAGManager;
    loadedSourceKeys: Set<string>;
    recentHistory?: ChatMessage[];
    latestSummaryBlobId?: string; // Keep track of the latest summary blob ID
}

const globalForCache = global as unknown as { waliorSessionCache: Map<string, WaliorSessionState> };
const sessionCache = globalForCache.waliorSessionCache || new Map<string, WaliorSessionState>();
if (process.env.NODE_ENV !== 'production') globalForCache.waliorSessionCache = sessionCache;

function buildWaliorStorePath(waliorId: string): string {
    return path.join(process.cwd(), '.cache', 'walior', 'rag', `${waliorId}.json`);
}

function decodeBlob(blob: Uint8Array): string {
    try {
        const decoder = new TextDecoder();
        return decoder.decode(blob);
    } catch (error) {
        return Buffer.from(blob).toString('base64');
    }
}

interface IdentityEnvelope {
    id: string;
    createdAt: string;
    identity: WaliorIdentity;
}

async function fetchIdentity(identityBlobId: string): Promise<WaliorIdentity> {
    const client = createBasicWalrusClient();
    
    try {
        // Try reading as a blob first (default)
        const raw = await readWalrusBlob(client, identityBlobId);
        const text = decodeBlob(raw);
        const resolved = JSON.parse(text) as IdentityEnvelope | WaliorIdentity;
        if ((resolved as IdentityEnvelope).identity) {
            return (resolved as IdentityEnvelope).identity;
        }
        return resolved as WaliorIdentity;
    } catch (blobError) {
        // If that fails (e.g. it's a Quilt), try listing patches to find the identity
        try {
            const patches = await listQuiltPatches(client, identityBlobId);
            // We expect at least one patch. The identity was likely uploaded with the name as identifier.
            // Since we don't know the name, we can just try to read the first patch or search for one.
            // If 'uploadWaliorIdentity' was used, the identifier is identity.name.
            // But we are fetching *to find out* identity.name.
            // So we pick the first patch available.
            
            if (patches.length === 0) {
                throw new Error('No patches found in identity quilt.');
            }

            // Sort or pick the most likely one if multiple? Usually just 1 for identity.
            const targetPatch = patches[0];
            const patch = await readWalrusQuiltPatch(client, targetPatch.patchId);
            const text = decodeBlob(patch.contents);
            const resolved = JSON.parse(text) as IdentityEnvelope | WaliorIdentity;

            if ((resolved as IdentityEnvelope).identity) {
                return (resolved as IdentityEnvelope).identity;
            }
            return resolved as WaliorIdentity;

        } catch (quiltError) {
            console.error('Failed to fetch identity as Blob AND Quilt:', identityBlobId);
            console.error('Blob Error:', blobError);
            console.error('Quilt Error:', quiltError);
            throw new Error(`Identity retrieval failed for ${identityBlobId}`);
        }
    }
}

function sourceKey(source: WaliorMemorySource): string {
    if (source.id && source.id.length > 0) {
        return source.id;
    }
    if (source.kind === 'blob' && source.blobId) {
        return `blob:${source.blobId}`;
    }
    if (source.kind === 'quiltPatch' && source.patchId) {
        return `quilt:${source.patchId}`;
    }
    throw new Error('Walior memory source is missing identifiers.');
}

async function ingestBlobSource(
    session: WaliorSessionState,
    source: WaliorMemorySource
): Promise<void> {
    if (!source.blobId) {
        throw new Error('Blob source missing blobId.');
    }
    const client = createBasicWalrusClient();
    await session.ragManager.ingestBlobById(
        client,
        source.blobId,
        {
            metadata: {
                source: 'walrus',
                waliorId: session.waliorId,
                label: source.description,
            },
        }
    );
}

async function ingestQuiltSource(
    session: WaliorSessionState,
    source: WaliorMemorySource
): Promise<void> {
    if (!source.patchId) {
        throw new Error('Quilt source missing patchId.');
    }
    const client = createBasicWalrusClient();
    const patch = await readWalrusQuiltPatch(client, source.patchId);
    const content = decodeBlob(patch.contents);
    await session.ragManager.addDocument(
        content,
        {
            source: 'walrus-quilt',
            waliorId: session.waliorId,
            label: source.description,
            identifier: patch.identifier,
        }
    );
}

async function ingestSources(
    session: WaliorSessionState,
    sources: WaliorMemorySource[] | undefined
): Promise<void> {
    if (!sources || sources.length === 0) {
        return;
    }

    for (const source of sources) {
        const key = sourceKey(source);
        if (session.loadedSourceKeys.has(key)) {
            continue;
        }
        if (source.kind === 'blob') {
            await ingestBlobSource(session, source);
        } else {
            await ingestQuiltSource(session, source);
        }
        session.loadedSourceKeys.add(key);
    }
}

async function ingestIdentitySummaries(session: WaliorSessionState): Promise<void> {
    if (!session.identity.curatedSummaries || session.identity.curatedSummaries.length === 0) {
        return;
    }

    for (const summary of session.identity.curatedSummaries) {
        await session.ragManager.addDocument(
            summary.content,
            {
                source: 'identity-summary',
                waliorId: session.waliorId,
                label: summary.label,
                timestamp: summary.timestamp,
            }
        );
    }
}

async function ingestLatestOnChainSummary(
    session: WaliorSessionState, 
    knownSummaryBlobId?: string
): Promise<void> {
    // If we are given a known ID (e.g. from client), use it to skip chain read
    // Otherwise fetch from chain
    let summaryBlobId = knownSummaryBlobId;
    
    if (!summaryBlobId) {
        summaryBlobId = await getLatestWaliorSummary(session.waliorId) || undefined;
    }

    if (!summaryBlobId) {
        console.log(`[Awakening] No latest summary blob found on-chain for WALior ${session.waliorId}.`);
        return;
    }

    // Store it in session state
    session.latestSummaryBlobId = summaryBlobId;

    const key = `blob:${summaryBlobId}`;
    if (session.loadedSourceKeys.has(key)) {
        // Already loaded this exact summary
        return;
    }

    // Check local RAG store first to skip redundant downloads (e.g. if already loaded during Awakening)
    if (await session.ragManager.hasBlob(summaryBlobId)) {
         console.log(`[Awakening] Summary blob ${summaryBlobId} found in local RAG store. Skipping download.`);
         session.loadedSourceKeys.add(key);
         return;
    }

    console.log(`[Awakening] Found latest summary blob ${summaryBlobId} for WALior ${session.waliorId}. Processing...`);
    
    const client = createBasicWalrusClient();
    
    const processPayload = async (text: string, source: 'Blob' | 'Quilt') => {
        const payload = JSON.parse(text);
        
        if (payload.content) {
            await session.ragManager.addDocument(
                payload.content,
                {
                    source: 'curated-summary',
                    waliorId: session.waliorId,
                    label: payload.label || 'Latest Summary',
                    walrus: {
                        blobId: summaryBlobId, // Tag with blobId for hasBlob check
                        kind: 'blob' 
                    }
                }
            );
        }

        if (Array.isArray(payload.history)) {
            session.recentHistory = payload.history;
            console.log(`[Awakening] Loaded ${payload.history.length} recent messages from history (${source}).`);
        }
        
        session.loadedSourceKeys.add(key);
    };

    try {
        // 1. Try as QUILT first (optimistic)
        // Most summaries are quilts now
        try {
            const patches = await listQuiltPatches(client, summaryBlobId);
            if (patches.length > 0) {
                const targetPatch = patches[0];
                const patch = await readWalrusQuiltPatch(client, targetPatch.patchId);
                const text = decodeBlob(patch.contents);
                await processPayload(text, 'Quilt');
                return;
            }
        } catch (quiltError) {
            // Ignore quilt list errors and fall through to blob
        }

        // 2. Fallback to BLOB
        console.log(`[Awakening] Quilt read skipped/failed for ${summaryBlobId}, trying as Blob...`);
        const raw = await readWalrusBlob(client, summaryBlobId);
        const text = decodeBlob(raw);
        await processPayload(text, 'Blob');

    } catch (err) {
        console.error(`[Awakening] Failed to read/parse summary blob/quilt ${summaryBlobId}:`, err);
    }
}

async function createSessionState(
    waliorId: string,
    identityBlobId: string,
    options?: { latestSummaryBlobId?: string }
): Promise<WaliorSessionState> {
    const identity = await fetchIdentity(identityBlobId);
    const ragManager = new WalrusRAGManager({
        storagePath: buildWaliorStorePath(waliorId),
    });
    const state: WaliorSessionState = {
        waliorId,
        identityBlobId,
        identity,
        ragManager,
        loadedSourceKeys: new Set<string>(),
        recentHistory: [],
    };

    await ingestIdentitySummaries(state);
    await ingestSources(state, identity.memorySources);
    
    // Fetch and ingest the latest summary from the blockchain registry
    // If we have a known ID, pass it to skip the chain read
    await ingestLatestOnChainSummary(state, options?.latestSummaryBlobId);
    
    return state;
}

export interface LoadWaliorSessionOptions {
    waliorId: string;
    identityBlobId: string;
    skipChainSync?: boolean;
    latestSummaryBlobId?: string; // Optimization: Client can pass this if known
}

export async function loadWaliorSession(
    options: LoadWaliorSessionOptions
): Promise<WaliorSessionState> {
    const key = options.waliorId;
    let cached = sessionCache.get(key);
    
    if (cached && cached.identityBlobId === options.identityBlobId) {
         // Only fetch from chain if skipChainSync is false (default)
         if (!options.skipChainSync) {
             // ingestLatestOnChainSummary checks if the key is already loaded, so it's efficient.
             // We pass the provided ID if available to optimize check
             await ingestLatestOnChainSummary(cached, options.latestSummaryBlobId);
         }
         return cached;
    }

    const state = await createSessionState(options.waliorId, options.identityBlobId, {
        latestSummaryBlobId: options.latestSummaryBlobId
    });
    sessionCache.set(key, state);
    return state;
}

export async function persistWaliorSummary(
    waliorId: string,
    summary: WaliorSessionSummaryInput
): Promise<{
    blobId: string;
}> {
    if (!summary.content || summary.content.trim().length === 0) {
        throw new Error('Summary content is required.');
    }

    const client = createBasicWalrusClient();
    const payload = JSON.stringify({
        waliorId,
        label: summary.label,
        content: summary.content,
        history: summary.history || [], // Persist history
        createdAt: new Date().toISOString(),
    }, null, 2);

    const file = createWalrusFileFromString(
        payload,
        summary.label || `summary-${Date.now()}`,
        {
            'content-type': 'application/json',
            'walior-id': waliorId,
        }
    );

    // Make file deletable (true) so we can clean up later
    const writeResult = await writeWalrusFile(client, file, 3, true, OWNER_KEYPAIR);

    const source: WaliorMemorySource = {
        id: `blob:${writeResult.blobId}`,
        kind: 'blob',
        blobId: writeResult.blobId,
        description: summary.label,
    };

    const session = sessionCache.get(waliorId);
    let oldBlobId: string | undefined;

    if (session) {
        // Track the old blob ID for deletion
        oldBlobId = session.latestSummaryBlobId;

        await session.ragManager.addDocument(
            summary.content,
            {
                source: 'curated-summary',
                waliorId,
                label: summary.label,
                walrus: {
                    blobId: writeResult.blobId, // Tag new document with blobId
                    kind: 'blob'
                }
            }
        );
        session.loadedSourceKeys.add(source.id);
        // Update local session history if provided
        if (summary.history) {
             session.recentHistory = summary.history;
        }
        // Update latest known blob ID
        session.latestSummaryBlobId = writeResult.blobId;
    } else {
        // If session not in cache, try to fetch the old summary ID from chain to be safe?
        // But getLatestWaliorSummary is async and we want to avoid extra calls if not needed.
        // We will just proceed without deleting if we don't know the old ID locally.
    }

    // Update on-chain registry
    try {
        await updateWaliorSummaryOnChain(waliorId, writeResult.blobId);
        
        // If on-chain update succeeded, try to delete the old blob
        if (oldBlobId && oldBlobId !== writeResult.blobId) {
            console.log(`[Cleanup] Attempting to find and delete old summary blob ${oldBlobId}...`);
            try {
                // We need to find the Sui Object ID corresponding to this Walrus Blob ID
                // The delete transaction requires the Object ID, not the Blob ID
                // Explicitly pass the admin address to ensure we search the admin's owned blobs
                const adminAddress = process.env.ADMIN_ADDRESS;
                const allBlobs = await getAllBlobObjects(adminAddress);
                const blobObject = allBlobs.find(b => b.blobId === oldBlobId);
                
                if (blobObject) {
                    console.log(`[Cleanup] Found blob object ${blobObject.address} for blob ID ${oldBlobId}. Deleting...`);
                    await deleteWalrusBlob(client, blobObject.address);
                    console.log(`[Cleanup] Successfully deleted old summary blob object ${blobObject.address}.`);
                } else {
                    console.warn(`[Cleanup] Could not find on-chain object for blob ID ${oldBlobId}. It may have already been deleted or indexer is lagging.`);
                }
            } catch (deleteError) {
                console.warn(`[Cleanup] Failed to delete old summary blob ${oldBlobId}. It might not be deletable or RPC failed.`, deleteError);
            }
        }
    } catch (error) {
        console.error('Failed to update on-chain summary:', error);
    }

    return {
        blobId: writeResult.blobId,
    };
}

export type { WaliorSessionState };
