import { WaliorIndex, GameState, GameChoice } from '../walior/types';

export type { GameState, GameChoice };

export interface GameTurnResponse {
    narrative: string;
    choices: GameChoice[];
    gameState: GameState;
}

export interface GameContext {
    waliorId: string;
    waliorName: string;
    waliorLore: any; // from identity
    currentState: GameState;
}
