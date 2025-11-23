import { NextResponse } from 'next/server';
import { startGame } from '@/lib/game/engine';
import { loadActiveRPGState, loadWaliorSession } from '@/lib/walior/session';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { waliorId, identityBlobId } = body;

        if (!waliorId || !identityBlobId) {
            return NextResponse.json({ error: 'Missing waliorId or identityBlobId' }, { status: 400 });
        }

        // Ensure session is loaded to access index
        await loadWaliorSession({ waliorId, identityBlobId, skipChainSync: false });

        // Check for existing active game
        const activeState = await loadActiveRPGState(waliorId);
        if (activeState && !activeState.isGameOver) {
            console.log(`[Game] Resuming active game for WALior ${waliorId} at Floor ${activeState.floor}`);
            
            const lastLog = activeState.log[activeState.log.length - 1] || 'Resuming game...';
            return NextResponse.json({
                narrative: `[RESUMED] ${lastLog}`,
                choices: activeState.currentChoices || [], // Use saved choices
                gameState: activeState
            });
        }

        // Start new game
        const response = await startGame(waliorId, identityBlobId);
        return NextResponse.json(response);
    } catch (error: unknown) {
        console.error('Game start error:', error);
        const message = error instanceof Error ? error.message : 'Failed to start game';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
