import { NextResponse } from 'next/server';
import { fetchWaliorObjects, getLatestWaliorSummary } from '@/lib/walior/onchain';
import { createBasicWalrusClient, readWalrusBlob, listQuiltPatches, readWalrusQuiltPatch } from '@/lib/walrus';
import { WaliorIdentity, WaliorIndex, WaliorListItem } from '@/lib/walior/types';
import { TextDecoder } from 'util';

// Helper to decode blob content
function decodeBlob(blob: Uint8Array): string {
    try {
        const decoder = new TextDecoder();
        return decoder.decode(blob);
    } catch (error) {
        return Buffer.from(blob).toString('base64');
    }
}

// Helper to fetch text from blob or quilt (duplicated from session.ts, should ideally be shared)
async function fetchTextFromBlobOrQuilt(client: any, blobId: string): Promise<string | null> {
    try {
        // Try Quilt first
        try {
            const patches = await listQuiltPatches(client, blobId);
            if (patches.length > 0) {
                const targetPatch = patches[0];
                const patch = await readWalrusQuiltPatch(client, targetPatch.patchId);
                return decodeBlob(patch.contents);
            }
        } catch (e) { /* ignore */ }

        // Fallback to Blob
        const raw = await readWalrusBlob(client, blobId);
        return decodeBlob(raw);
    } catch (e) {
        console.warn(`Failed to fetch text for blob ${blobId}`, e);
        return null;
    }
}

async function enrichWalior(walior: WaliorListItem, client: any): Promise<WaliorListItem> {
    const enriched = { ...walior };

    try {
        // 1. Fetch Identity (Parallel)
        const identityPromise = fetchTextFromBlobOrQuilt(client, walior.identityBlobId).then(text => {
            if (!text) return null;

            try {
                const json = JSON.parse(text);
                const identity = (json.identity || json) as WaliorIdentity;
                
                if (!identity.persona || !Array.isArray(identity.persona.traits)) return null;

                return {
                    archetype: identity.archetype || 'Unknown',
                    traits: identity.persona.traits.slice(0, 3) // Top 3 traits
                };
            } catch (e) { 
                return null; 
            }
        });

        // 2. Fetch RPG Summary from Index (Parallel)
        const rpgPromise = getLatestWaliorSummary(walior.objectId).then(async (indexBlobId) => {
            if (!indexBlobId) return null;
            const text = await fetchTextFromBlobOrQuilt(client, indexBlobId);
            if (!text) return null;
            
            try {
                const index = JSON.parse(text) as WaliorIndex;
                if (index.rpg && Array.isArray(index.rpg.pastRuns) && index.rpg.pastRuns.length > 0) {
                    return {
                        runsCount: index.rpg.pastRuns.length,
                        bestFloor: Math.max(0, ...index.rpg.pastRuns.map(r => r.floor)),
                        victories: index.rpg.pastRuns.filter(r => r.victory).length
                    };
                }
            } catch (e) { return null; }
            return null;
        });

        const [identitySummary, rpgSummary] = await Promise.all([identityPromise, rpgPromise]);
        
        if (identitySummary) {
            // console.log(`[Enrich] Added identity summary for ${walior.name}`);
            enriched.identitySummary = identitySummary;
        }
        if (rpgSummary) {
            enriched.rpgSummary = rpgSummary;
        }

    } catch (e) {
        console.error(`Failed to enrich walior ${walior.name}`, e);
    }

    return enriched;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const owner = searchParams.get('owner');
        if (!owner || owner.trim().length === 0) {
            return NextResponse.json({ error: 'owner query parameter is required.' }, { status: 400 });
        }

        const packageId = process.env.WALIOR_PACKAGE_ID;
        if (!packageId) {
            return NextResponse.json({ error: 'WALIOR_PACKAGE_ID is not configured.' }, { status: 500 });
        }

        // 1. Fetch basic list from chain
        const waliors = await fetchWaliorObjects(owner, packageId);

        // 2. Enrich with Walrus data
        const client = createBasicWalrusClient();
        
        // Limit concurrency to avoid flooding Walrus/Sui RPC if user has many waliors
        // Process in chunks of 5? Or just all if list is small.
        // For now, just Promise.all since users usually have < 10 waliors.
        const enrichedWaliors = await Promise.all(
            waliors.map(w => enrichWalior(w, client))
        );

        return NextResponse.json(enrichedWaliors);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to list WALiors.';
        console.error(error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
