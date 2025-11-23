import { NextResponse } from 'next/server';
import { persistActiveRPGState } from '@/lib/walior/session';
import { GameState } from '@/lib/game/types';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { waliorId, gameState } = body as { waliorId: string; gameState: GameState };

        if (!waliorId || !gameState) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const { blobId } = await persistActiveRPGState(waliorId, gameState);

        return NextResponse.json({ success: true, blobId });
    } catch (error: unknown) {
        console.error('Game active save error:', error);
        const message = error instanceof Error ? error.message : 'Failed to save active game';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

