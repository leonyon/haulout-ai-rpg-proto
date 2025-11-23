'use client';

import {
    ChangeEvent,
    FormEvent,
    useState,
} from 'react';

interface SearchResult {
    id: string;
    similarity: number;
    document: {
        id: string;
        content: string;
        metadata: Record<string, unknown>;
    };
}

export default function RagPlaygroundPage() {
    const [blobId, setBlobId] = useState('');
    const [ingestMessage, setIngestMessage] = useState('');
    const [ingestLoading, setIngestLoading] = useState(false);
    const [ingestAllLoading, setIngestAllLoading] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);

    const [chatQuestion, setChatQuestion] = useState('');
    const [chatAnswer, setChatAnswer] = useState('');
    const [chatContext, setChatContext] = useState<SearchResult[]>([]);
    const [chatLoading, setChatLoading] = useState(false);

    const [errorMessage, setErrorMessage] = useState('');

    function onBlobIdChange(event: ChangeEvent<HTMLInputElement>) {
        setBlobId(event.target.value);
    }

    function onSearchQueryChange(event: ChangeEvent<HTMLInputElement>) {
        setSearchQuery(event.target.value);
    }

    function onChatQuestionChange(event: ChangeEvent<HTMLTextAreaElement>) {
        setChatQuestion(event.target.value);
    }

    async function ingestSingleBlob() {
        const trimmedId = blobId.trim();

        if (!trimmedId) {
            setErrorMessage('Enter a blob ID before ingesting.');
            return;
        }

        setIngestLoading(true);
        setErrorMessage('');
        setIngestMessage('');

        try {
            const response = await fetch('/api/rag/ingest', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ blobId: trimmedId }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to ingest blob.');
            }

            if (data.documentId) {
                setIngestMessage(`Blob ${data.blobId} stored as document ${data.documentId}.`);
            } else {
                setIngestMessage(`Blob ${data.blobId} was skipped (likely duplicate).`);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown ingestion error.';
            setErrorMessage(message);
        } finally {
            setIngestLoading(false);
        }
    }

    async function ingestAllBlobs() {
        setIngestAllLoading(true);
        setErrorMessage('');
        setIngestMessage('');

        try {
            const response = await fetch('/api/rag/ingest', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ingestAll: true }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to ingest all blobs.');
            }

            const ingestedCount = Array.isArray(data.results)
                ? data.results.filter(function countInserted(entry: { documentId: string | null }) {
                    return Boolean(entry.documentId);
                }).length
                : 0;

            setIngestMessage(`Processed ${data.results?.length ?? 0} Walrus blobs, ingested ${ingestedCount} new memories.`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown ingestion error.';
            setErrorMessage(message);
        } finally {
            setIngestAllLoading(false);
        }
    }

    async function runSearch() {
        const trimmedQuery = searchQuery.trim();

        if (!trimmedQuery) {
            setErrorMessage('Enter a query before searching.');
            return;
        }

        setSearchLoading(true);
        setErrorMessage('');

        try {
            const response = await fetch('/api/rag/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: trimmedQuery, limit: 5 }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Search failed.');
            }

            setSearchResults(Array.isArray(data.results) ? data.results : []);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown search error.';
            setErrorMessage(message);
        } finally {
            setSearchLoading(false);
        }
    }

    async function runChat() {
        const trimmedQuestion = chatQuestion.trim();

        if (!trimmedQuestion) {
            setErrorMessage('Enter a question before calling OpenAI.');
            return;
        }

        setChatLoading(true);
        setErrorMessage('');
        setChatAnswer('');
        setChatContext([]);

        try {
            const response = await fetch('/api/rag/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ question: trimmedQuestion, limit: 5 }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Chat request failed.');
            }

            setChatAnswer(data.answer || '');
            setChatContext(Array.isArray(data.context) ? data.context : []);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown chat error.';
            setErrorMessage(message);
        } finally {
            setChatLoading(false);
        }
    }

    function handleIngestSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        void ingestSingleBlob();
    }

    function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        void runSearch();
    }

    function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        void runChat();
    }

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-black py-16 px-6">
            <div className="max-w-4xl mx-auto space-y-10">
                <header>
                    <p className="text-sm uppercase tracking-wide text-blue-600 dark:text-blue-300">
                        Walrus RAG Playground
                    </p>
                    <h1 className="text-4xl font-bold text-black dark:text-zinc-50 mt-2">
                        Test Retrieval-Augmented Generation
                    </h1>
                    <p className="text-zinc-600 dark:text-zinc-400 mt-4">
                        Ingest Walrus blobs into the local memory store, search through embeddings, and send questions to OpenAI with the retrieved context.
                    </p>
                </header>

                {errorMessage && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-200">
                        {errorMessage}
                    </div>
                )}

                {ingestMessage && (
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-800 dark:text-green-200">
                        {ingestMessage}
                    </div>
                )}

                <section className="bg-white dark:bg-zinc-900 rounded-xl shadow p-6 space-y-6">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                            <h2 className="text-2xl font-semibold text-black dark:text-zinc-50">
                                Ingest Walrus Blobs
                            </h2>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                                Convert Walrus blob contents into embeddings and store them locally for RAG.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={ingestAllBlobs}
                            disabled={ingestAllLoading}
                            className="px-4 py-2 rounded-md text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-zinc-400 disabled:cursor-not-allowed"
                        >
                            {ingestAllLoading ? 'Processing...' : 'Ingest All Owned Blobs'}
                        </button>
                    </div>

                    <form className="space-y-4" onSubmit={handleIngestSubmit}>
                        <label className="block text-sm font-medium text-black dark:text-zinc-200">
                            Walrus Blob ID
                        </label>
                        <input
                            type="text"
                            value={blobId}
                            onChange={onBlobIdChange}
                            placeholder="Enter a Walrus blob ID"
                            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-black dark:text-zinc-50"
                        />
                        <button
                            type="submit"
                            disabled={ingestLoading}
                            className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:bg-zinc-400 disabled:cursor-not-allowed"
                        >
                            {ingestLoading ? 'Ingesting...' : 'Ingest Single Blob'}
                        </button>
                    </form>
                </section>

                <section className="bg-white dark:bg-zinc-900 rounded-xl shadow p-6 space-y-6">
                    <div>
                        <h2 className="text-2xl font-semibold text-black dark:text-zinc-50">
                            Search Embedded Memories
                        </h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                            Runs cosine similarity search over the vector store to confirm which memories will be sent to OpenAI.
                        </p>
                    </div>

                    <form className="space-y-4" onSubmit={handleSearchSubmit}>
                        <label className="block text-sm font-medium text-black dark:text-zinc-200">
                            Search Query
                        </label>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={onSearchQueryChange}
                            placeholder="Ask about stored Walrus content..."
                            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-black dark:text-zinc-50"
                        />
                        <button
                            type="submit"
                            disabled={searchLoading}
                            className="px-4 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-zinc-400 disabled:cursor-not-allowed"
                        >
                            {searchLoading ? 'Searching...' : 'Search Memories'}
                        </button>
                    </form>

                    {searchResults.length > 0 && (
                        <div className="space-y-4">
                            {searchResults.map(function renderResult(result) {
                                const metadata = result.document.metadata || {};
                                return (
                                    <div
                                        key={result.id}
                                        className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4"
                                    >
                                        <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
                                            <span>Similarity: {result.similarity.toFixed(3)}</span>
                                            <span>{String(metadata.source || 'walrus')}</span>
                                        </div>
                                        <p className="mt-3 text-black dark:text-zinc-100 whitespace-pre-wrap break-words">
                                            {result.document.content}
                                        </p>
                                        {!!metadata.walrus && typeof metadata.walrus === 'object' && (
                                            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                                                Walrus Info: {JSON.stringify(metadata.walrus)}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                <section className="bg-white dark:bg-zinc-900 rounded-xl shadow p-6 space-y-6">
                    <div>
                        <h2 className="text-2xl font-semibold text-black dark:text-zinc-50">
                            Ask OpenAI with RAG Context
                        </h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                            Sends your question plus the top Walrus memories to the configured OpenAI model.
                        </p>
                    </div>

                    <form className="space-y-4" onSubmit={handleChatSubmit}>
                        <label className="block text-sm font-medium text-black dark:text-zinc-200">
                            Question
                        </label>
                        <textarea
                            value={chatQuestion}
                            onChange={onChatQuestionChange}
                            rows={4}
                            placeholder="e.g., What did Walrus blob X say about quest rewards?"
                            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-black dark:text-zinc-50"
                        />
                        <button
                            type="submit"
                            disabled={chatLoading}
                            className="px-4 py-2 rounded-md text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:bg-zinc-400 disabled:cursor-not-allowed"
                        >
                            {chatLoading ? 'Calling OpenAI...' : 'Ask with RAG'}
                        </button>
                    </form>

                    {chatAnswer && (
                        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
                            <h3 className="text-lg font-semibold text-purple-800 dark:text-purple-200 mb-2">
                                OpenAI Answer
                            </h3>
                            <p className="text-purple-900 dark:text-purple-100 whitespace-pre-wrap">
                                {chatAnswer}
                            </p>
                        </div>
                    )}

                    {chatContext.length > 0 && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-black dark:text-zinc-50">
                                Context Sent to OpenAI
                            </h3>
                            {chatContext.map(function renderContext(result, index) {
                                return (
                                    <div
                                        key={`${result.id}-${index}`}
                                        className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4"
                                    >
                                        <div className="text-sm text-zinc-500 dark:text-zinc-400">
                                            Memory {index + 1} — Similarity {result.similarity.toFixed(3)}
                                        </div>
                                        <p className="mt-2 text-black dark:text-zinc-100 whitespace-pre-wrap break-words">
                                            {result.document.content}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

