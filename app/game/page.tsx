'use client';

import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';
import { useState, useEffect } from 'react';
import { GameInterface } from '@/app/components/GameInterface';
import Link from 'next/link';

interface Walior {
    objectId: string;
    name: string;
    identityBlobId: string;
    owner: string;
    imageUrl?: string;
}

export default function GamePage() {
    const account = useCurrentAccount();
    const [waliors, setWaliors] = useState<Walior[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedWalior, setSelectedWalior] = useState<Walior | null>(null);

    const fetchWaliors = async () => {
        if (!account) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/walior/list?owner=${account.address}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    setWaliors(data);
                }
            }
        } catch (e) {
            console.error('Failed to fetch waliors', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (account) {
            fetchWaliors();
        } else {
            setWaliors([]);
            setSelectedWalior(null);
        }
    }, [account]);

    return (
        <main className="min-h-screen p-4 md:p-8 bg-black text-zinc-50 font-sans selection:bg-blue-500/30">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <header className="flex flex-col md:flex-row justify-between items-center mb-8 md:mb-12 gap-4">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="text-zinc-500 hover:text-zinc-300 transition-colors">
                            ← Back
                        </Link>
                        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                            The Sunken Spire
                        </h1>
                    </div>
                    <ConnectButton />
                </header>

                {!account ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                        <div className="text-6xl">🏰</div>
                        <p className="text-xl text-zinc-400 max-w-md">
                            Connect your wallet to guide your WALiors into the depths of the Abyss.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {selectedWalior ? (
                            <>
                                <GameInterface 
                                    waliorId={selectedWalior.objectId}
                                    identityBlobId={selectedWalior.identityBlobId}
                                    name={selectedWalior.name}
                                    imageUrl={selectedWalior.imageUrl}
                                    onExit={() => setSelectedWalior(null)}
                                />
                                <div className="text-center text-xs text-zinc-500 mt-6 space-y-1 max-w-2xl mx-auto opacity-70 hover:opacity-100 transition-opacity">
                                    <p className="font-semibold text-blue-500">This is a prototype.</p>
                                    <p>Game Master response generation can take up to around a minute.</p>
                                    <p className="text-red-400/80">Leaving this window or pressing the back button in top left will result in data loss.</p>
                                    <p>Use Save & Exit in top right for data persistence.</p>
                                    <p className="pt-2 font-serif italic">Have fun!</p>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 md:p-10 text-center mb-12">
                                    <h2 className="text-2xl font-bold mb-4 text-blue-100">Choose Your Champion</h2>
                                    <p className="text-zinc-400 max-w-2xl mx-auto">
                                        The Spire awaits. Select a WALior to embark on a journey to the 15th floor. 
                                        Their memories and traits will shape the challenges they face.
                                    </p>
                                </div>

                                {loading ? (
                                    <div className="text-center text-zinc-500 animate-pulse">Scrying for allies...</div>
                                ) : waliors.length === 0 ? (
                                    <div className="text-center py-12 bg-zinc-900 rounded-lg border border-zinc-800">
                                        <p className="text-zinc-500 mb-4">You have no WALiors to send.</p>
                                        <Link href="/" className="text-blue-400 hover:text-blue-300 underline">
                                            Summon one at the Academy first.
                                        </Link>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {waliors.map((walior) => (
                                            <button
                                                key={walior.objectId}
                                                onClick={() => setSelectedWalior(walior)}
                                                className="group relative flex flex-col items-center text-center p-6 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-blue-500/50 hover:bg-zinc-800 transition-all duration-300 hover:-translate-y-1 shadow-lg"
                                            >
                                                <div className="relative w-24 h-24 mb-4">
                                                    {walior.imageUrl ? (
                                                        <img 
                                                            src={walior.imageUrl} 
                                                            alt={walior.name} 
                                                            className="w-full h-full rounded-full object-cover border-4 border-zinc-800 group-hover:border-blue-500/30 transition-colors"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full rounded-full bg-zinc-800 flex items-center justify-center text-4xl border-4 border-zinc-700">
                                                            👾
                                                        </div>
                                                    )}
                                                    <div className="absolute inset-0 rounded-full shadow-inner-lg"></div>
                                                </div>
                                                
                                                <h3 className="text-xl font-bold text-zinc-100 group-hover:text-blue-400 transition-colors mb-1">
                                                    {walior.name}
                                                </h3>
                                                <span className="text-xs font-mono text-zinc-600 truncate w-full px-4 mb-4">
                                                    {walior.objectId}
                                                </span>

                                                {(walior as any).identitySummary && (
                                                    <div className="text-xs text-zinc-400 mb-4 space-y-1">
                                                        <div className="text-blue-300 font-semibold">{(walior as any).identitySummary.archetype}</div>
                                                        <div className="italic">{(walior as any).identitySummary.traits.join(', ')}</div>
                                                    </div>
                                                )}

                                                {(walior as any).rpgSummary && (
                                                    <div className="text-xs text-zinc-500 mb-4 border-t border-zinc-800 pt-2 w-full">
                                                        <div className="flex justify-between px-4">
                                                            <span>Runs: {(walior as any).rpgSummary.runsCount}</span>
                                                            <span className="text-yellow-600">Best: F{(walior as any).rpgSummary.bestFloor}</span>
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                <div className="mt-auto w-full py-2 bg-zinc-950 border border-zinc-800 rounded text-sm text-zinc-400 group-hover:bg-blue-900/20 group-hover:text-blue-200 group-hover:border-blue-800 transition-all">
                                                    Enter Dungeon
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}

