import { NextResponse } from 'next/server';
import { searchMemories } from '@/lib/rag/server';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(function handleParseError() {
            return {};
        });

        const query = typeof body?.query === 'string' ? body.query : '';
        const limit = typeof body?.limit === 'number' ? body.limit : 5;
        const threshold = typeof body?.threshold === 'number' ? body.threshold : 0.6;

        const results = await searchMemories(query, limit, threshold);
        return NextResponse.json(results);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown search error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}



