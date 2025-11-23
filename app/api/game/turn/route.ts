import { NextResponse } from 'next/server';
import { playTurn } from '@/lib/game/engine';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { waliorId, identityBlobId, previousState, choiceText } = body;

        if (!waliorId || !identityBlobId || !previousState || !choiceText) {
            return NextResponse.json({ error: 'Missing required game parameters' }, { status: 400 });
        }

        const nextState = await playTurn(waliorId, identityBlobId, previousState, choiceText);
        return NextResponse.json(nextState);
    } catch (error: unknown) {
        console.error('Game turn error:', error);
        const message = error instanceof Error ? error.message : 'Failed to process turn';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

