'use client';

import { useState, useEffect, useRef } from 'react';

interface ChatProps {
    waliorId: string;
    identityBlobId: string;
    name: string;
    imageUrl?: string;
    onClose: () => void;
}

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export function Chat({ waliorId, identityBlobId, name, imageUrl, onClose }: ChatProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [initializing, setInitializing] = useState(true);
    const [latestSummaryBlobId, setLatestSummaryBlobId] = useState<string | undefined>(undefined);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const initRef = useRef<string | null>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, initializing]);

    // Initialize session (pull identity) on mount
    useEffect(() => {
        if (initRef.current === waliorId) return;
        initRef.current = waliorId;

        const initSession = async () => {
            try {
                const response = await fetch('/api/walior/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ waliorId, identityBlobId }),
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to initialize session');
                }

                const data = await response.json();
                
                // Load recent history if available
                if (data.recentHistory && Array.isArray(data.recentHistory) && data.recentHistory.length > 0) {
                     setMessages(data.recentHistory.map((m: Message) => ({
                         role: m.role,
                         content: m.content
                     })));
                }

                // Store summary blob ID for later
                if (data.latestSummaryBlobId) {
                    setLatestSummaryBlobId(data.latestSummaryBlobId);
                }

            } catch (err) {
                console.error('Session init error:', err);
                setMessages([{ role: 'assistant', content: 'Error: Could not connect to WALior memory.' }]);
            } finally {
                setInitializing(false);
            }
        };

        initSession();
    }, [waliorId, identityBlobId]);

    // Flush session summary on close or page unload
    // We use a ref to keep the latest flush logic without re-triggering useEffect
    const flushSessionRef = useRef(() => {});

    useEffect(() => {
        flushSessionRef.current = async () => {
            // Use sendBeacon for page unload if possible, or fetch keepalive
            const payload = JSON.stringify({ waliorId });
            const blob = new Blob([payload], { type: 'application/json' });
            
            // Try navigator.sendBeacon first for reliability on unload
            if (navigator.sendBeacon) {
                navigator.sendBeacon('/api/walior/summary', blob);
            } else {
                // Fallback to fetch
                fetch('/api/walior/summary', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload,
                    keepalive: true
                }).catch(e => console.error('Flush error', e));
            }
        };
    }, [waliorId]);

    useEffect(() => {
        const handleBeforeUnload = () => {
            flushSessionRef.current();
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            // Also flush when component unmounts (e.g. user clicks Close button)
            flushSessionRef.current();
        };
    }, []);

    const handleClose = () => {
        // Explicitly call onClose, the useEffect cleanup will handle the flush
        onClose();
    };

    const sendMessage = async () => {
        if (!input.trim() || loading) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setLoading(true);

        try {
            const response = await fetch('/api/walior/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    waliorId,
                    identityBlobId,
                    message: userMessage,
                    // Pass optimizations:
                    latestSummaryBlobId,
                    recentHistory: messages.slice(-10), // Send last 10 messages as fallback context
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Request failed with status ${response.status}`);
            }

            const data = await response.json();
            setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Could not reach the WALior.' }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[600px] bg-white dark:bg-zinc-900 rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                <div className="flex items-center gap-3">
                    {imageUrl ? (
                        <img 
                            src={imageUrl} 
                            alt={name} 
                            className="w-10 h-10 rounded-full object-cover bg-zinc-200 dark:bg-zinc-800" 
                        />
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-lg">
                            👾
                        </div>
                    )}
                <h2 className="text-lg font-semibold">{name}</h2>
                </div>
                <button 
                    onClick={handleClose}
                    className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                    Close
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {initializing ? (
                    <div className="flex justify-center items-center h-full text-zinc-500">
                        <div className="flex flex-col items-center gap-2">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900 dark:border-zinc-100"></div>
                            <p>Awakening {name}...</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {messages.length === 0 && (
                            <div className="text-center text-zinc-400 italic p-4">
                                No recent history found. Start a conversation!
                            </div>
                        )}
                        {messages.map((msg, i) => (
                            <div 
                                key={i} 
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`max-w-[80%] p-3 rounded-lg ${
                                    msg.role === 'user' 
                                        ? 'bg-blue-600 text-white' 
                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                                }`}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-zinc-100 dark:bg-zinc-800 p-3 rounded-lg text-zinc-500 text-sm">
                                    Thinking...
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </div>

            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                        placeholder="Say something..."
                        className="flex-1 p-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        disabled={loading || initializing}
                    />
                    <button
                        onClick={sendMessage}
                        disabled={loading || initializing || !input.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}
