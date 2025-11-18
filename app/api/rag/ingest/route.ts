import { NextResponse } from 'next/server';
import { ingestWalrusBlob, ingestAllWalrusBlobs } from '@/lib/rag/server';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(function handleParseError() {
            return {};
        });

        if (body && body.ingestAll) {
            const results = await ingestAllWalrusBlobs();
            return NextResponse.json({ results });
        }

        if (body && typeof body.blobId === 'string') {
            const result = await ingestWalrusBlob(body.blobId);
            return NextResponse.json(result);
        }

        return NextResponse.json({ error: 'Provide a blobId or set ingestAll to true.' }, { status: 400 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown ingestion error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}



