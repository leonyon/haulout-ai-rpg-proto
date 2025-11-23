import { NextResponse } from 'next/server';
import { persistRPGRun } from '@/lib/walior/session';
import { GameState } from '@/lib/game/types';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { waliorId, gameState } = body as { waliorId: string; gameState: GameState };

        if (!waliorId || !gameState) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        // Use the specialized RPG persistence (Master Index aware)
        const { blobId } = await persistRPGRun(waliorId, gameState);

        return NextResponse.json({ success: true, blobId });
    } catch (error: unknown) {
        console.error('Game save error:', error);
        const message = error instanceof Error ? error.message : 'Failed to save game';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
