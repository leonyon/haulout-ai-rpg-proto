import { NextResponse } from 'next/server';
import { loadWaliorSession } from '@/lib/walior';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const waliorId = typeof body?.waliorId === 'string' ? body.waliorId.trim() : '';
        const identityBlobId = typeof body?.identityBlobId === 'string' ? body.identityBlobId.trim() : '';

        if (!waliorId || !identityBlobId) {
            return NextResponse.json({ error: 'waliorId and identityBlobId are required.' }, { status: 400 });
        }

        // This will fetch the identity and ingest it into the RAG manager
        // It also now loads the recent history from the latest summary blob
        const session = await loadWaliorSession({
            waliorId,
            identityBlobId,
        });

        return NextResponse.json({ 
            status: 'success',
            name: session.identity.name,
            archetype: session.identity.archetype,
            recentHistory: session.recentHistory || [],
            // Return the summaryBlobId found during load (if any) so client can use it
            // We extract it from loadedSourceKeys for now or need to expose it on session
            // Since session doesn't explicitly store "latestSummaryBlobId", we can infer it or 
            // ideally update session state to expose it.
            // For now, let's skip this optimization or implement it properly. 
            // Let's update session state to expose it.
            latestSummaryBlobId: session.latestSummaryBlobId
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to initialize session.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
