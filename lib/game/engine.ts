import { GameContext, GameState, GameTurnResponse } from './types';
import { generateSystemPrompt } from './prompts';
import { loadWaliorSession } from '@/lib/walior/session';

async function callOpenAIGameMaster(
    systemPrompt: string,
    userPrompt: string,
    model: string = 'gpt-4o-mini'
): Promise<GameTurnResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not configured.');
    }

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            temperature: 1,
            messages,
            response_format: { type: "json_object" } // Enforce JSON
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI request failed: ${text}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    
    if (!content) {
        throw new Error('No content returned from Game Master.');
    }

    try {
        const result = JSON.parse(content) as GameTurnResponse;

        // Validate and Filter Choices for Items
        if (result.choices && Array.isArray(result.choices)) {
            result.choices = result.choices.filter(choice => {
                if (choice.requiredItem) {
                    const hasItem = result.gameState.inventory.some(item => 
                        item.toLowerCase().includes(choice.requiredItem!.toLowerCase()) ||
                        choice.requiredItem!.toLowerCase().includes(item.toLowerCase())
                    );
                    if (!hasItem) {
                        console.warn(`[AI GM] Filtered invalid choice requiring ${choice.requiredItem}`);
                        return false;
                    }
                }
                return true;
            });
            
            // Fallback if all filtered
            if (result.choices.length === 0) {
                result.choices.push({
                    id: "fallback",
                    text: "Proceed carefully...",
                    type: "investigation"
                });
            }
        }

        // Ensure currentChoices are saved in state for resuming
        if (result.gameState && result.choices) {
            result.gameState.currentChoices = result.choices;
        }
        return result;
    } catch (error) {
        console.error('Failed to parse GM response:', error);
        throw new Error('Game Master malfunctioned (Invalid JSON).');
    }
}

export async function startGame(
    waliorId: string,
    identityBlobId: string
): Promise<GameTurnResponse> {
    // Load identity to get name and lore
    const session = await loadWaliorSession({
        waliorId,
        identityBlobId,
        skipChainSync: true
    });

    const initialState: GameState = {
        floor: 1,
        health: 100,
        maxHealth: 100,
        status: 'Healthy',
        activeEffects: [],
        inventory: [],
        isGameOver: false,
        victory: false,
        log: []
    };

    const context: GameContext = {
        waliorId,
        waliorName: session.identity.name,
        waliorLore: session.identity.lore,
        currentState: initialState
    };

    const systemPrompt = generateSystemPrompt(context, session.index?.rpg.pastRuns);
    const userPrompt = `Initialize the game. The WALior stands at the precipice of The Sunken Spire. Describe the scene and offer the first 3 choices to enter.`;

    const result = await callOpenAIGameMaster(systemPrompt, userPrompt);
    
    // Force the log to contain the narrative we just generated
    result.gameState.log = [result.narrative];

    return result;
}

export async function playTurn(
    waliorId: string,
    identityBlobId: string,
    previousState: GameState,
    choiceText: string
): Promise<GameTurnResponse> {
    // Re-load identity for context (cached mostly)
    const session = await loadWaliorSession({
        waliorId,
        identityBlobId,
        skipChainSync: true
    });

    const context: GameContext = {
        waliorId,
        waliorName: session.identity.name,
        waliorLore: session.identity.lore,
        currentState: previousState
    };

    const systemPrompt = generateSystemPrompt(context, session.index?.rpg.pastRuns);
    
    // Construct state summary for the LLM
    const stateSummary = JSON.stringify({
        floor: previousState.floor,
        health: previousState.health,
        status: previousState.status,
        activeEffects: previousState.activeEffects,
        inventory: previousState.inventory,
        log: previousState.log.slice(-3) // Give last 3 log entries for immediate context
    });

    const userPrompt = `
Current Game State: ${stateSummary}
Player Action: "${choiceText}"

1. Resolve the action (did they succeed? take damage?).
2. Advance the narrative.
3. If they survived, present the next encounter.
4. If they advanced a floor, update the floor number.
5. If health <= 0, set isGameOver=true.
6. If floor == 15 and survived, set victory=true.

Respond in JSON.
    `.trim();

    const result = await callOpenAIGameMaster(systemPrompt, userPrompt);

    // Merge logic: The AI only sees the last 3 logs, so it returns a truncated log array.
    // We need to append the NEW narrative to the ORIGINAL full log history.
    
    const newNarrative = result.narrative;
    
    // Update the result state to include the full history + new entry
    result.gameState.log = [...previousState.log, newNarrative];

    return result;
}
