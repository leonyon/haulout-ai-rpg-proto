'use client';

import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';
import { useState, useEffect } from 'react';
import { Chat } from './components/Chat';

interface Walior {
    objectId: string;
    name: string;
    identityBlobId: string;
    owner: string;
}

export default function Home() {
    const account = useCurrentAccount();
    const [waliors, setWaliors] = useState<Walior[]>([]);
    const [loading, setLoading] = useState(false);
    const [minting, setMinting] = useState(false);
    const [mintStatus, setMintStatus] = useState('');
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

    const handleMint = async () => {
        if (!account) return;
        setMinting(true);
        setMintStatus('Initiating...');
        
        try {
            const res = await fetch('/api/walior/mint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    receiver: account.address,
                    createIdentity: true,
                    name: '', // Random name
                }),
            });
            
            if (!res.ok) {
                // If the request failed before streaming started (e.g. rate limit)
                const err = await res.json();
                alert(`Mint failed: ${err.error || 'Unknown error'}`);
                setMinting(false);
                return;
            }

            if (!res.body) return;

            const reader = res.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    try {
                        const update = JSON.parse(line);
                        if (update.status === 'error') {
                            alert(`Mint failed: ${update.message}`);
                            setMinting(false);
                            return;
                        } else if (update.status === 'complete') {
                            setMintStatus('Done!');
                            
                            // Optimistically add the new WALior to the list
                            if (update.data && update.data.waliorObjectId && update.data.identityBlobId) {
                                const newWalior: Walior = {
                                    objectId: update.data.waliorObjectId,
                                    name: update.data.name || 'New WALior',
                                    identityBlobId: update.data.identityBlobId,
                                    owner: account.address,
                                };
                                setWaliors(prev => [...prev, newWalior]);
                            }

                            // Also trigger a background fetch to sync up eventually
                            fetchWaliors();
                            setMinting(false);
                            return;
                        } else if (update.status && update.message) {
                            setMintStatus(update.message);
                        }
                    } catch (e) {
                        console.error('Error parsing chunk', e);
                    }
                }
            }
        } catch (e) {
            console.error('Mint error', e);
            alert('Mint failed due to network error');
            setMinting(false);
        }
    };

    return (
        <main className="min-h-screen p-8 bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-50">
            <div className="max-w-4xl mx-auto">
                <header className="flex justify-between items-center mb-12">
                    <h1 className="text-3xl font-bold tracking-tight">WALiors AI RPG</h1>
                    <ConnectButton />
                </header>

                {!account ? (
                    <div className="text-center py-20">
                        <p className="text-xl text-zinc-500">Connect your wallet to begin your journey.</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {selectedWalior ? (
                            <Chat 
                                waliorId={selectedWalior.objectId}
                                identityBlobId={selectedWalior.identityBlobId}
                                name={selectedWalior.name}
                                onClose={() => setSelectedWalior(null)}
                            />
                        ) : (
                            <>
                                <div className="flex justify-between items-center">
                                    <h2 className="text-xl font-semibold">Your WALiors</h2>
                                    <div className="flex items-center gap-4">
                                        {minting && (
                                            <div className="flex items-center gap-2 text-sm text-zinc-500 animate-pulse">
                                                <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                {mintStatus}
                                            </div>
                                        )}
                                        <button
                                            onClick={handleMint}
                                            disabled={minting}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
                                        >
                                            Summon New WALior
                                        </button>
                                    </div>
                                </div>

                                {loading ? (
                                    <div className="text-zinc-500">Loading...</div>
                                ) : waliors.length === 0 ? (
                                    <div className="text-center py-12 bg-zinc-100 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                                        <p className="text-zinc-500 mb-4">You have no WALiors yet.</p>
                                        <button 
                                            onClick={handleMint}
                                            disabled={minting}
                                            className="text-blue-600 hover:underline disabled:text-blue-400 disabled:no-underline disabled:cursor-not-allowed"
                                        >
                                            {minting ? 'Summoning...' : 'Summon one now'}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {waliors.map((walior) => (
                                            <button
                                                key={walior.objectId}
                                                onClick={() => !minting && setSelectedWalior(walior)}
                                                disabled={minting}
                                                className="flex flex-col text-left p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-blue-500 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <span className="text-lg font-medium group-hover:text-blue-600 mb-2">
                                                    {walior.name}
                                                </span>
                                                <span className="text-xs font-mono text-zinc-500 truncate w-full">
                                                    ID: {walior.objectId}
                                                </span>
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
