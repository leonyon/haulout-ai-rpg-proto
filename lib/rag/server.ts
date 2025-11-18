'use server';

import { WalrusRAGManager } from '@/lib/rag';
import { createBasicWalrusClient } from '@/lib/walrus';
import { getAllBlobObjects } from '@/lib/graphql';

const walrusRagManager = new WalrusRAGManager();

export async function ingestWalrusBlob(blobId: string): Promise<{
    blobId: string;
    documentId: string | null;
}> {
    const trimmedId = blobId.trim();

    if (!trimmedId) {
        throw new Error('Blob ID is required');
    }

    const client = createBasicWalrusClient();
    const documentId = await walrusRagManager.ingestBlobById(client, trimmedId);
    return {
        blobId: trimmedId,
        documentId,
    };
}

export async function ingestAllWalrusBlobs() {
    const client = createBasicWalrusClient();
    const blobObjects = await getAllBlobObjects();
    return walrusRagManager.ingestBlobObjects(client, blobObjects);
}

export async function searchMemories(
    query: string,
    limit = 5,
    threshold = 0.6
) {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
        throw new Error('Search query is required');
    }

    const results = await walrusRagManager.search(trimmedQuery, limit, threshold);
    return { results };
}

interface ChatResponse {
    answer: string;
    context: Awaited<ReturnType<typeof walrusRagManager.search>>;
}

export async function answerQuestionWithOpenAI(
    question: string,
    limit = 5
): Promise<ChatResponse> {
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion) {
        throw new Error('Question is required');
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not configured');
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const contextResults = await walrusRagManager.search(trimmedQuestion, limit, 0.6);
    const contextSection = contextResults.length > 0
        ? contextResults
            .map(function formatResult(result, index) {
                const metadata = result.document.metadata;
                const source = typeof metadata.source === 'string'
                    ? metadata.source
                    : 'unknown';
                return [
                    `Memory ${index + 1}`,
                    `Source: ${source}`,
                    `Similarity: ${result.similarity.toFixed(3)}`,
                    `Content: ${result.document.content}`,
                ].join('\n');
            })
            .join('\n\n')
        : 'No relevant memories were found.';

    const messages = [
        {
            role: 'system',
            content: 'You are a helpful AI that must ground every answer in the Walrus memories provided. If the memories do not contain the answer, say you do not know.',
        },
        {
            role: 'user',
            content: `Use the Walrus memories below to answer the question.\n\nMemories:\n${contextSection}\n\nQuestion: ${trimmedQuestion}`,
        },
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages,
            temperature: 0.3,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI request failed: ${errorText}`);
    }

    const payload = await response.json();
    const answer = payload?.choices?.[0]?.message?.content?.trim() || 'No answer returned.';

    return {
        answer,
        context: contextResults,
    };
}



