import { NextResponse } from 'next/server';
import { answerQuestionWithOpenAI } from '@/lib/rag/server';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(function handleParseError() {
            return {};
        });

        const question = typeof body?.question === 'string' ? body.question : '';
        const limit = typeof body?.limit === 'number' ? body.limit : 5;

        const result = await answerQuestionWithOpenAI(question, limit);
        return NextResponse.json(result);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown chat error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

