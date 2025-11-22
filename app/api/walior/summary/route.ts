import { NextResponse } from 'next/server';
import { flushSessionSummary } from '@/lib/walior';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const waliorId = typeof body?.waliorId === 'string' ? body.waliorId.trim() : '';

        if (!waliorId) {
            return NextResponse.json({ error: 'waliorId is required.' }, { status: 400 });
        }

        const blobId = await flushSessionSummary(waliorId);

        return NextResponse.json({ 
            status: 'success',
            summaryBlobId: blobId
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to flush session summary.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

