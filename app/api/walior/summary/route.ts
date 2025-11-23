import { NextResponse } from 'next/server';
import { flushSessionSummary } from '@/lib/walior';
import type { ChatMessage } from '@/lib/walior/types';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const waliorId = typeof body?.waliorId === 'string' ? body.waliorId.trim() : '';
        const historyInput = Array.isArray(body?.history) ? body.history : [];

        const validatedHistory: ChatMessage[] = historyInput
            .filter((msg: any) =>
                msg &&
                typeof msg.content === 'string' &&
                (msg.role === 'user' || msg.role === 'assistant') &&
                msg.content.trim().length > 0
            )
            .map((msg: any) => ({
                role: msg.role,
                content: msg.content.trim(),
            }));

        if (!waliorId) {
            return NextResponse.json({ error: 'waliorId is required.' }, { status: 400 });
        }

        const summaryResult = await flushSessionSummary(waliorId, validatedHistory);

        if (!summaryResult) {
            return NextResponse.json({ 
                status: 'noop',
                summaryBlobId: null,
            });
        }

        return NextResponse.json({ 
            status: 'success',
            summaryBlobId: summaryResult.blobId,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to flush session summary.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

