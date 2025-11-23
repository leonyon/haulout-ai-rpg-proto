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
import { buildCachePath } from '@/lib/utils/cache-paths';
import type {
    WaliorIdentity,
    WaliorMemorySource,
    WaliorSessionSummaryInput,
    ChatMessage,
    WaliorIndex,
    GameState
} from './types';
import { updateWaliorSummaryOnChain, getLatestWaliorSummary } from './onchain';

interface WaliorSessionState {
    waliorId: string;
    identityBlobId: string;
    identity: WaliorIdentity;
    ragManager: WalrusRAGManager;
    loadedSourceKeys: Set<string>;
    recentHistory?: ChatMessage[];
    latestSummaryBlobId?: string; 
    index?: WaliorIndex; // Cached Master Index
}

const globalForCache = global as unknown as { waliorSessionCache: Map<string, WaliorSessionState> };
const sessionCache = globalForCache.waliorSessionCache || new Map<string, WaliorSessionState>();
if (process.env.NODE_ENV !== 'production') globalForCache.waliorSessionCache = sessionCache;

function buildWaliorStorePath(waliorId: string): string {
    return buildCachePath('walior', 'rag', `${waliorId}.json`);
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
        const raw = await readWalrusBlob(client, identityBlobId);
        const text = decodeBlob(raw);
        const resolved = JSON.parse(text) as IdentityEnvelope | WaliorIdentity;
        if ((resolved as IdentityEnvelope).identity) {
            return (resolved as IdentityEnvelope).identity;
        }
        return resolved as WaliorIdentity;
    } catch (blobError) {
        try {
            const patches = await listQuiltPatches(client, identityBlobId);
            if (patches.length === 0) throw new Error('No patches found in identity quilt.');
            const targetPatch = patches[0];
            const patch = await readWalrusQuiltPatch(client, targetPatch.patchId);
            const text = decodeBlob(patch.contents);
            const resolved = JSON.parse(text) as IdentityEnvelope | WaliorIdentity;
            if ((resolved as IdentityEnvelope).identity) return (resolved as IdentityEnvelope).identity;
            return resolved as WaliorIdentity;
        } catch (quiltError) {
            console.error('Failed to fetch identity:', identityBlobId);
            throw new Error(`Identity retrieval failed for ${identityBlobId}`);
        }
    }
}

function sourceKey(source: WaliorMemorySource): string {
    if (source.id && source.id.length > 0) return source.id;
    if (source.kind === 'blob' && source.blobId) return `blob:${source.blobId}`;
    if (source.kind === 'quiltPatch' && source.patchId) return `quilt:${source.patchId}`;
    throw new Error('Walior memory source is missing identifiers.');
}

async function ingestBlobSource(session: WaliorSessionState, source: WaliorMemorySource): Promise<void> {
    if (!source.blobId) throw new Error('Blob source missing blobId.');
    const client = createBasicWalrusClient();
    await session.ragManager.ingestBlobById(client, source.blobId, {
        metadata: { source: 'walrus', waliorId: session.waliorId, label: source.description },
    });
}

async function ingestQuiltSource(session: WaliorSessionState, source: WaliorMemorySource): Promise<void> {
    if (!source.patchId) throw new Error('Quilt source missing patchId.');
    const client = createBasicWalrusClient();
    const patch = await readWalrusQuiltPatch(client, source.patchId);
    const content = decodeBlob(patch.contents);
    await session.ragManager.addDocument(content, {
        source: 'walrus-quilt', waliorId: session.waliorId, label: source.description, identifier: patch.identifier,
    });
}

async function ingestSources(session: WaliorSessionState, sources: WaliorMemorySource[] | undefined): Promise<void> {
    if (!sources || sources.length === 0) return;
    for (const source of sources) {
        const key = sourceKey(source);
        if (session.loadedSourceKeys.has(key)) continue;
        if (source.kind === 'blob') await ingestBlobSource(session, source);
        else await ingestQuiltSource(session, source);
        session.loadedSourceKeys.add(key);
    }
}

async function ingestIdentitySummaries(session: WaliorSessionState): Promise<void> {
    if (!session.identity.curatedSummaries || session.identity.curatedSummaries.length === 0) return;
    for (const summary of session.identity.curatedSummaries) {
        await session.ragManager.addDocument(summary.content, {
            source: 'identity-summary', waliorId: session.waliorId, label: summary.label, timestamp: summary.timestamp,
        });
    }
}

// Helper to fetch text from blob or quilt
async function fetchTextFromBlobOrQuilt(blobId: string): Promise<string | null> {
    const client = createBasicWalrusClient();
    try {
        // Try Quilt
        try {
            const patches = await listQuiltPatches(client, blobId);
            if (patches.length > 0) {
                const targetPatch = patches[0];
                const patch = await readWalrusQuiltPatch(client, targetPatch.patchId);
                return decodeBlob(patch.contents);
            }
        } catch (e) { /* ignore */ }

        // Try Blob
        const raw = await readWalrusBlob(client, blobId);
        return decodeBlob(raw);
    } catch (e) {
        console.warn(`Failed to fetch text for blob ${blobId}`, e);
        return null;
    }
}

async function ingestLatestOnChainSummary(session: WaliorSessionState, knownSummaryBlobId?: string): Promise<void> {
    let rootBlobId = knownSummaryBlobId;
    if (!rootBlobId) {
        rootBlobId = await getLatestWaliorSummary(session.waliorId) || undefined;
    }

    if (!rootBlobId) {
        console.log(`[Awakening] No root blob found on-chain for WALior ${session.waliorId}.`);
        return;
    }

    // Store root ID as latest summary ID for now (client compatibility), but we might update it if it's an index
    session.latestSummaryBlobId = rootBlobId;

    const key = `blob:${rootBlobId}`;
    if (session.loadedSourceKeys.has(key)) return;

    console.log(`[Awakening] Processing root blob ${rootBlobId}...`);
    const text = await fetchTextFromBlobOrQuilt(rootBlobId);
    if (!text) return;

    let payload: any;
    try {
        payload = JSON.parse(text);
    } catch (e) {
        console.error('Failed to parse root blob JSON', e);
        return;
    }

    // CHECK: Is this a Master Index?
    if (payload.version && payload.chat && payload.rpg) {
        console.log(`[Awakening] Detected Master Index (v${payload.version}).`);
        session.index = payload as WaliorIndex;
        session.loadedSourceKeys.add(key);

        // Process Chat Summary from Index
        if (session.index.chat.latestSummaryBlobId) {
            const chatBlobId = session.index.chat.latestSummaryBlobId;
            const chatKey = `blob:${chatBlobId}`;
            
            // Update latestSummaryBlobId to point to the actual chat summary for the Chat UI/RAG
            session.latestSummaryBlobId = chatBlobId;

            if (!session.loadedSourceKeys.has(chatKey)) {
                if (await session.ragManager.hasBlob(chatBlobId)) {
                    session.loadedSourceKeys.add(chatKey);
                } else {
                    console.log(`[Awakening] Fetching referenced chat summary ${chatBlobId}...`);
                    const chatText = await fetchTextFromBlobOrQuilt(chatBlobId);
                    if (chatText) {
                        await processChatSummaryPayload(session, chatText, chatBlobId);
                    }
                }
            }
        }
        return;
    }

    // Fallback: It's a direct legacy Chat Summary
    console.log(`[Awakening] Detected legacy/direct Chat Summary.`);
    await processChatSummaryPayload(session, text, rootBlobId);
}

async function processChatSummaryPayload(session: WaliorSessionState, text: string, blobId: string) {
    try {
        const payload = JSON.parse(text);
        if (payload.content) {
            await session.ragManager.addDocument(payload.content, {
                source: 'curated-summary',
                waliorId: session.waliorId,
                label: payload.label || 'Latest Summary',
                walrus: { blobId: blobId, kind: 'blob' }
            });
        }
        if (Array.isArray(payload.history)) {
            session.recentHistory = payload.history;
        }
        session.loadedSourceKeys.add(`blob:${blobId}`);
    } catch (e) {
        console.error('Error processing chat summary payload', e);
    }
}

async function createSessionState(waliorId: string, identityBlobId: string, options?: { latestSummaryBlobId?: string }): Promise<WaliorSessionState> {
    const identity = await fetchIdentity(identityBlobId);
    const ragManager = new WalrusRAGManager({ storagePath: buildWaliorStorePath(waliorId) });
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
    await ingestLatestOnChainSummary(state, options?.latestSummaryBlobId);
    return state;
}

export interface LoadWaliorSessionOptions {
    waliorId: string;
    identityBlobId: string;
    skipChainSync?: boolean;
    latestSummaryBlobId?: string;
}

export async function loadWaliorSession(options: LoadWaliorSessionOptions): Promise<WaliorSessionState> {
    const key = options.waliorId;
    let cached = sessionCache.get(key);
    
    if (cached && cached.identityBlobId === options.identityBlobId) {
         if (!options.skipChainSync) {
             await ingestLatestOnChainSummary(cached, options.latestSummaryBlobId);
         }
         return cached;
    }

    const state = await createSessionState(options.waliorId, options.identityBlobId, { latestSummaryBlobId: options.latestSummaryBlobId });
    sessionCache.set(key, state);
    return state;
}

// --- Persistence Helpers ---

function getOrCreateIndex(session: WaliorSessionState): WaliorIndex {
    if (session.index) return session.index;
    // If no index, create a default one. 
    // If we had a legacy summary, preserve it in chat section.
    return {
        version: 1,
        chat: {
            latestSummaryBlobId: session.latestSummaryBlobId,
            lastUpdated: new Date().toISOString(),
        },
        rpg: {
            pastRuns: []
        }
    };
}

async function saveIndex(waliorId: string, index: WaliorIndex): Promise<string> {
    const client = createBasicWalrusClient();
    const payload = JSON.stringify(index, null, 2);
    const file = createWalrusFileFromString(payload, `master-index-${waliorId}-${Date.now()}`, {
        'content-type': 'application/json',
        'walior-id': waliorId,
        'type': 'walior-master-index'
    });
    const result = await writeWalrusFile(client, file, 3, true, OWNER_KEYPAIR);
    
    // Update on-chain
    await updateWaliorSummaryOnChain(waliorId, result.blobId);
    return result.blobId;
}

export async function persistWaliorSummary(waliorId: string, summary: WaliorSessionSummaryInput): Promise<{ blobId: string }> {
    if (!summary.content || summary.content.trim().length === 0) throw new Error('Summary content is required.');

    const session = sessionCache.get(waliorId); // Should act on cached session if possible
    if (!session) throw new Error('Session not loaded');

    const client = createBasicWalrusClient();
    
    // 1. Create Chat Summary Blob
    const payload = JSON.stringify({
        waliorId,
        label: summary.label,
        content: summary.content,
        history: summary.history || [],
        createdAt: new Date().toISOString(),
    }, null, 2);

    const file = createWalrusFileFromString(payload, summary.label || `summary-${Date.now()}`, {
        'content-type': 'application/json', 'walior-id': waliorId
    });
    const writeResult = await writeWalrusFile(client, file, 3, true, OWNER_KEYPAIR);
    const newSummaryBlobId = writeResult.blobId;

    // 2. Update Index
    const index = getOrCreateIndex(session);
    index.chat.latestSummaryBlobId = newSummaryBlobId;
    index.chat.lastUpdated = new Date().toISOString();
    session.index = index; // Update cache

    // 3. Save Index & Update Chain
    const indexBlobId = await saveIndex(waliorId, index);

    // 4. Update Local RAG (Session State)
    // We use the Summary Blob ID for RAG ingestion, NOT the Index Blob ID
    await session.ragManager.addDocument(summary.content, {
        source: 'curated-summary', waliorId, label: summary.label,
        walrus: { blobId: newSummaryBlobId, kind: 'blob' }
    });
    session.loadedSourceKeys.add(`blob:${newSummaryBlobId}`);
    if (summary.history) session.recentHistory = summary.history;
    session.latestSummaryBlobId = newSummaryBlobId;

    // We return the INDEX blob ID because that's what effectively represents the "latest state" on chain
    // But wait, Chat.tsx expects `latestSummaryBlobId` to be something it can pass back to us to load context.
    // If we pass the Index ID back to client, next loadWaliorSession will see it as rootBlobId, detect Index, and load correctly.
    return { blobId: indexBlobId };
}

export async function persistRPGRun(waliorId: string, gameState: GameState): Promise<{ blobId: string }> {
    const session = sessionCache.get(waliorId);
    if (!session) throw new Error('Session not loaded');

    const client = createBasicWalrusClient();

    // 1. Save Game Log Blob
    const payload = JSON.stringify(gameState, null, 2);
    const file = createWalrusFileFromString(payload, `rpg-run-${waliorId}-${Date.now()}`, {
        'content-type': 'application/json', 'walior-id': waliorId, 'type': 'rpg-run-log'
    });
    const writeResult = await writeWalrusFile(client, file, 3, true, OWNER_KEYPAIR);

    // 2. Update Index
    const index = getOrCreateIndex(session);
    index.rpg.pastRuns.push({
        blobId: writeResult.blobId,
        timestamp: new Date().toISOString(),
        floor: gameState.floor,
        victory: gameState.victory
    });
    // Clear active game on finish
    index.rpg.activeGame = undefined;
    session.index = index;

    // 3. Save Index
    const indexBlobId = await saveIndex(waliorId, index);
    return { blobId: indexBlobId };
}

export async function persistActiveRPGState(waliorId: string, gameState: GameState): Promise<{ blobId: string }> {
    const session = sessionCache.get(waliorId);
    if (!session) throw new Error('Session not loaded');

    const client = createBasicWalrusClient();

    // 1. Save Active State Blob
    const payload = JSON.stringify(gameState, null, 2);
    const file = createWalrusFileFromString(payload, `rpg-save-${waliorId}-${Date.now()}`, {
        'content-type': 'application/json', 'walior-id': waliorId, 'type': 'rpg-save-state'
    });
    const writeResult = await writeWalrusFile(client, file, 3, true, OWNER_KEYPAIR); // 1 epoch for save files? keeping 3 for safety

    // 2. Update Index
    const index = getOrCreateIndex(session);
    index.rpg.activeGame = {
        blobId: writeResult.blobId,
        lastUpdated: new Date().toISOString()
    };
    session.index = index;

    // 3. Save Index
    const indexBlobId = await saveIndex(waliorId, index);
    return { blobId: indexBlobId };
}

export async function loadActiveRPGState(waliorId: string): Promise<GameState | null> {
    const session = sessionCache.get(waliorId);
    if (!session || !session.index || !session.index.rpg.activeGame) return null;

    const blobId = session.index.rpg.activeGame.blobId;
    const text = await fetchTextFromBlobOrQuilt(blobId);
    if (!text) return null;

    try {
        return JSON.parse(text) as GameState;
    } catch (e) {
        console.error('Failed to parse active game state', e);
        return null;
    }
}

export type { WaliorSessionState };
