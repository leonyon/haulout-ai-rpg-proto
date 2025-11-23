'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { GameState, GameTurnResponse, GameChoice } from '@/lib/game/types';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface GameInterfaceProps {
    waliorId: string;
    identityBlobId: string;
    name: string;
    imageUrl?: string;
    onExit: () => void;
    onAmbientUpdate?: (ambient: { gradient: string; glow?: string }) => void;
}

export function GameInterface({ waliorId, identityBlobId, name, imageUrl, onExit, onAmbientUpdate }: GameInterfaceProps) {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [currentNarrative, setCurrentNarrative] = useState<string>('');
    const [choices, setChoices] = useState<GameChoice[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const loadedRef = useRef<string | null>(null);

    // Start game on mount (once per waliorId)
    useEffect(() => {
        if (loadedRef.current === waliorId) return;
        loadedRef.current = waliorId;

        const startGame = async () => {
            setLoading(true);
            try {
                const res = await fetch('/api/game/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ waliorId, identityBlobId }),
                });
                
                if (!res.ok) throw new Error('Failed to start game');
                
                const data: GameTurnResponse = await res.json();
                setGameState(data.gameState);
                setCurrentNarrative(data.narrative);
                setChoices(data.choices);
            } catch (e) {
                console.error(e);
                alert('Failed to start the game session.');
                onExit();
            } finally {
                setLoading(false);
            }
        };

        startGame();
    }, [waliorId, identityBlobId, onExit]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [gameState, currentNarrative]);

    const handleChoice = async (choice: GameChoice) => {
        if (!gameState || loading) return;
        setLoading(true);

        try {
            const res = await fetch('/api/game/turn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    waliorId,
                    identityBlobId,
                    previousState: gameState,
                    choiceText: choice.text
                }),
            });

            if (!res.ok) throw new Error('Failed to process turn');

            const data: GameTurnResponse = await res.json();
            setGameState(data.gameState);
            setCurrentNarrative(data.narrative);
            setChoices(data.choices);

        } catch (e) {
            console.error(e);
            alert('Error processing turn. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const ambientMood = useMemo(() => {
        if (!gameState) {
            return {
                gradient: 'bg-gradient-to-b from-black via-zinc-950 to-black',
                glow: '',
            };
        }

        const dangerLevel = gameState.health / gameState.maxHealth;
        const floorProgress = gameState.floor / 15;

        if (gameState.isGameOver && !gameState.victory) {
            return {
                gradient: 'bg-gradient-to-b from-black via-red-950/80 to-black',
                glow: 'after:content-[""] after:absolute after:inset-0 after:bg-red-600/5 after:blur-3xl',
            };
        }

        if (gameState.victory) {
            return {
                gradient: 'bg-gradient-to-b from-black via-amber-950/70 to-black',
                glow: 'after:content-[""] after:absolute after:inset-0 after:bg-amber-500/10 after:blur-3xl',
            };
        }

        if (dangerLevel < 0.3) {
            return {
                gradient: 'bg-gradient-to-b from-black via-red-950/60 to-zinc-950',
                glow: 'after:content-[""] after:absolute after:inset-0 after:bg-red-800/10 after:blur-2xl',
            };
        }

        if (floorProgress > 0.6) {
            return {
                gradient: 'bg-gradient-to-b from-black via-purple-950/70 to-black',
                glow: 'after:content-[""] after:absolute after:inset-0 after:bg-purple-500/10 after:blur-3xl',
            };
        }

        return {
            gradient: 'bg-gradient-to-b from-black via-blue-950/60 to-black',
            glow: 'after:content-[""] after:absolute after:inset-0 after:bg-blue-500/5 after:blur-2xl',
        };
    }, [gameState]);

    useEffect(() => {
        if (onAmbientUpdate) {
            onAmbientUpdate(ambientMood);
        }
    }, [ambientMood, onAmbientUpdate]);

    const handleSaveAndExit = async () => {
        if (!gameState) return;
        setSaving(true);
        try {
            // If game over, archive the run. If active, just save state.
            const endpoint = gameState.isGameOver ? '/api/game/end' : '/api/game/save';
            setSaveStatus(gameState.isGameOver ? 'Uploading final chronicle...' : 'Preserving run progress...');

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ waliorId, gameState }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error || 'Failed to persist game state.');
            }
            setSaveStatus('Saved to Walrus & registry.');
            setTimeout(() => setSaveStatus(null), 2000);
            onExit();
        } catch (e) {
            console.error(e);
            alert('Failed to save game log.');
            onExit(); // Exit anyway
        } finally {
            setSaving(false);
        }
    };

    if (!gameState && loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[600px] text-zinc-400">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zinc-400 mb-4"></div>
                <p>Entering The Sunken Spire...</p>
            </div>
        );
    }

    if (!gameState) return null;

    return (
        <div className={`relative h-screen max-h-[800px] text-zinc-100 rounded-lg overflow-hidden border border-zinc-800 shadow-2xl font-serif ${ambientMood.gradient}`}>
            {ambientMood.glow && <div className={`${ambientMood.glow} pointer-events-none z-0`}></div>}
            <div className="relative z-10 flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-zinc-950 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                    {imageUrl ? (
                        <img src={imageUrl} alt={name} className="w-12 h-12 rounded-full border-2 border-blue-900/50 object-cover" />
                    ) : (
                        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-2xl">👾</div>
                    )}
                    <div>
                        <h2 className="font-bold text-lg text-blue-200">{name}</h2>
                        <div className="flex gap-4 text-xs text-zinc-400 uppercase tracking-wider">
                            <span>Floor {gameState.floor} / 15</span>
                            <span className={`${gameState.health < 30 ? 'text-red-500 animate-pulse' : 'text-green-500'}`}>
                                HP: {gameState.health}/{gameState.maxHealth}
                            </span>
                            <span>Status: {gameState.status}</span>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <button 
                        onClick={handleSaveAndExit}
                        disabled={saving}
                        className="text-xs text-zinc-500 hover:text-zinc-300 px-3 py-1 border border-zinc-800 rounded hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-60"
                    >
                        {saving && <span className="h-3 w-3 border border-current border-t-transparent rounded-full animate-spin" />}
                        {saving ? 'Saving...' : 'Save & Exit'}
                    </button>
                    {(saving || saveStatus) && (
                        <span className="text-[11px] text-zinc-500">
                            {saveStatus || 'Preparing legend...'}
                        </span>
                    )}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                
                {/* Narrative Log - Left Side */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-zinc-900 scrollbar-thin scrollbar-thumb-zinc-700" ref={scrollRef}>
                    {/* Render ONLY the latest log entry */}
                    {gameState.log.slice(-1).map((entry, i) => (
                         <div key={gameState.log.length - 1} className="text-sm pl-4 text-zinc-100 border-l-2 border-blue-500">
                            <ReactMarkdown 
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    p: ({node, ...props}) => <p className="mb-4 last:mb-0 leading-relaxed" {...props} />,
                                    strong: ({node, ...props}) => <strong className="font-bold text-blue-300" {...props} />,
                                    em: ({node, ...props}) => <em className="italic text-purple-300" {...props} />,
                                    ul: ({node, ...props}) => <ul className="list-disc ml-4 mb-2 space-y-1" {...props} />,
                                    li: ({node, ...props}) => <li {...props} />,
                                    code: ({node, ...props}) => <span className="font-mono text-sm bg-green-900/30 text-green-400 px-1 rounded border border-green-900/50" {...props} />,
                                    del: ({node, ...props}) => <span className="font-bold text-red-400 decoration-red-600 decoration-2" {...props} />,
                                    blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-zinc-600 pl-4 italic text-zinc-400 my-4" {...props} />,
                                }}
                            >
                                {entry}
                            </ReactMarkdown>
                        </div>
                    ))}


                    {loading && (
                        <div className="flex items-center gap-2 text-zinc-500 italic text-sm animate-pulse">
                            <span>The Game Master is thinking...</span>
                        </div>
                    )}

                    {/* Game Over / Victory State */}
                    {gameState.isGameOver && (
                        <div className={`mt-8 p-6 rounded-xl text-center border-2 ${gameState.victory ? 'border-yellow-500/50 bg-yellow-900/20' : 'border-red-900/50 bg-red-950/30'}`}>
                            <h3 className={`text-3xl font-bold mb-2 ${gameState.victory ? 'text-yellow-400' : 'text-red-500'}`}>
                                {gameState.victory ? 'VICTORY!' : 'DEFEAT'}
                            </h3>
                            <p className="text-zinc-300 mb-6">
                                {gameState.victory 
                                    ? `You have conquered The Sunken Spire and reached the Core!`
                                    : `Your journey ends here in the cold dark.`}
                            </p>
                            <button
                                onClick={handleSaveAndExit}
                                className="px-6 py-3 bg-zinc-100 text-zinc-900 rounded hover:bg-zinc-200 font-bold"
                            >
                                Save Legend & Return
                            </button>
                        </div>
                    )}
                </div>

                {/* Controls / Inventory - Right Side (Desktop) or Bottom (Mobile) */}
                {!gameState.isGameOver && (
                    <div className="md:w-80 bg-zinc-950 border-t md:border-t-0 md:border-l border-zinc-800 p-4 flex flex-col gap-4">
                        
                        {/* Choices */}
                        <div className="flex-1 flex flex-col justify-end gap-3">
                            <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-2">Your Action</h3>
                            {choices.map((choice) => (
                                <button
                                    key={choice.id}
                                    onClick={() => handleChoice(choice)}
                                    disabled={loading}
                                    className={`
                                        p-4 text-left text-sm rounded-lg border transition-all duration-200
                                        ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:translate-x-1'}
                                        ${choice.type === 'aggressive' ? 'border-red-900/30 bg-red-950/10 hover:bg-red-900/20 hover:border-red-500/50' : ''}
                                        ${choice.type === 'stealth' ? 'border-blue-900/30 bg-blue-950/10 hover:bg-blue-900/20 hover:border-blue-500/50' : ''}
                                        ${choice.type === 'diplomacy' ? 'border-yellow-900/30 bg-yellow-950/10 hover:bg-yellow-900/20 hover:border-yellow-500/50' : ''}
                                        ${choice.type === 'investigation' ? 'border-purple-900/30 bg-purple-950/10 hover:bg-purple-900/20 hover:border-purple-500/50' : ''}
                                        ${choice.type === 'magic' ? 'border-cyan-900/30 bg-cyan-950/10 hover:bg-cyan-900/20 hover:border-cyan-500/50' : ''}
                                        ${!choice.type ? 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-600' : ''}
                                    `}
                                >
                                    <ReactMarkdown 
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            p: ({node, ...props}) => <span {...props} />, // Render paragraphs as spans to keep button layout clean
                                            strong: ({node, ...props}) => <strong className="font-bold text-blue-300" {...props} />,
                                            em: ({node, ...props}) => <em className="italic text-purple-300" {...props} />,
                                            code: ({node, ...props}) => <span className="font-mono text-xs bg-green-900/30 text-green-400 px-1 rounded border border-green-900/50" {...props} />,
                                            del: ({node, ...props}) => <span className="font-bold text-red-400" {...props} />,
                                        }}
                                    >
                                        {choice.text}
                                    </ReactMarkdown>
                                </button>
                            ))}
                        </div>

                        {/* Inventory & Status */}
                        <div className="mt-auto pt-4 border-t border-zinc-900 space-y-4">
                            {/* Status Effects */}
                            <div>
                                <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-2">Status Effects</h3>
                                {(!gameState.activeEffects || gameState.activeEffects.length === 0) ? (
                                    <p className="text-zinc-600 text-xs italic">No active effects.</p>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {gameState.activeEffects.map((effect, i) => (
                                            <span key={i} className="text-xs px-2 py-1 bg-purple-900/20 border border-purple-800 rounded text-purple-300">
                                                {effect}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Inventory */}
                            <div>
                                <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-2">Inventory</h3>
                            {gameState.inventory.length === 0 ? (
                                <p className="text-zinc-600 text-xs italic">Empty pockets...</p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {gameState.inventory.map((item, i) => (
                                        <span key={i} className="text-xs px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-zinc-300">
                                            {item}
                                        </span>
                                    ))}
                                </div>
                            )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
            </div>
        </div>
    );
}
