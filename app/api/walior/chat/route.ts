import { NextResponse } from 'next/server';
import { runWaliorChat } from '@/lib/walior';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(function handle() {
            return {};
        });

        const waliorId = typeof body?.waliorId === 'string' ? body.waliorId.trim() : '';
        const identityBlobId = typeof body?.identityBlobId === 'string' ? body.identityBlobId.trim() : '';
        const message = typeof body?.message === 'string' ? body.message : '';

        if (!waliorId || !identityBlobId || !message) {
            return NextResponse.json({ error: 'waliorId, identityBlobId, and message are required.' }, { status: 400 });
        }

        const summary = body?.summary && typeof body.summary === 'object'
            ? {
                label: typeof body.summary.label === 'string' ? body.summary.label : '',
                content: typeof body.summary.content === 'string' ? body.summary.content : '',
            }
            : undefined;

        const result = await runWaliorChat({
            waliorId,
            identityBlobId,
            message,
            summary,
            limit: typeof body?.limit === 'number' ? body.limit : undefined,
        });

        return NextResponse.json(result);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to chat with WALior.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}



