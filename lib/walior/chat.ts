import { loadWaliorSession, persistWaliorSummary } from './session';
import type {
    WaliorChatRequest,
    WaliorChatResponse,
    WaliorIdentity,
    WaliorSessionSummaryInput,
    ChatMessage,
} from './types';
import type { RAGSearchResult } from '@/lib/rag';

// Track minimal session history in memory to allow batching summaries
// Key: waliorId, Value: Array of { role: string, content: string }
const sessionHistoryBuffer = new Map<string, Array<ChatMessage>>();
const SUMMARY_THRESHOLD = 10; // Raised threshold to 10 exchanges (20 messages)
const summaryLocks = new Set<string>(); // Key: waliorId

function buildSystemPrompt(identity: WaliorIdentity): string {
    const lines: string[] = [];
    lines.push(identity.chat.systemPrompt);
    lines.push(`You are ${identity.name}, a ${identity.archetype}.`);
    lines.push(`Persona traits: ${identity.persona.traits.join(', ')}.`);
    lines.push(`Primary goals: ${identity.persona.goals.join('; ')}.`);
    if (identity.chat.guardrails.length > 0) {
        lines.push(`Guardrails: ${identity.chat.guardrails.join(' | ')}.`);
    }
    return lines.join('\n');
}

function buildContextSection(results: RAGSearchResult[]): string {
    if (results.length === 0) {
        return 'No cached WALior memories were retrieved.';
    }

    const sections: string[] = [];
    for (let index = 0; index < results.length; index += 1) {
        const result = results[index];
        const metadata = result.document.metadata || {};
        const label = typeof metadata.label === 'string'
            ? metadata.label
            : `Memory ${index + 1}`;
        sections.push([
            `${label}`,
            `Similarity: ${result.similarity.toFixed(3)}`,
            `Content: ${result.document.content}`,
        ].join('\n'));
    }

    return sections.join('\n\n');
}

function mapContext(results: RAGSearchResult[]) {
    return results.map(function project(result) {
        return {
            id: result.id,
            similarity: result.similarity,
            content: result.document.content,
            metadata: result.document.metadata || {},
        };
    });
}

async function callOpenAIChat(
    systemPrompt: string,
    userPrompt: string,
    history: Array<ChatMessage> = [],
    model: string
): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not configured.');
    }

    const messages = [
        { role: 'system', content: systemPrompt },
        // Add recent history for immediate context
        ...history.map(msg => ({ role: msg.role, content: msg.content })),
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
            temperature: 0.4,
            messages,
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI request failed: ${text}`);
    }

    const payload = await response.json();
    const answer = payload?.choices?.[0]?.message?.content;
    if (!answer || typeof answer !== 'string') {
        return 'No answer returned.';
    }
    return answer.trim();
}

async function generateSummary(
    history: Array<ChatMessage>,
    model: string
): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    const prompt = [
        'Summarize the following conversation segment into a concise, factual memory log.',
        'Focus on key events, facts learned, and decisions made.',
        'Do not include "User said" or "AI said", write it as a narrative or list of facts.',
        '',
        ...history.map(m => `${m.role.toUpperCase()}: ${m.content}`),
    ].join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            temperature: 0.3,
            messages: [{ role: 'user', content: prompt }],
        }),
    });

    if (!response.ok) return '';
    const payload = await response.json();
    return payload?.choices?.[0]?.message?.content || '';
}

export async function flushSessionSummary(waliorId: string): Promise<string | null> {
    if (summaryLocks.has(waliorId)) {
        console.log(`[Manual-Summary] Skipped: Summary for WALior ${waliorId} is already in progress.`);
        return null;
    }

    const history = sessionHistoryBuffer.get(waliorId) || [];
    if (history.length === 0) {
        return null;
    }

    console.log(`[Manual-Summary] Flushing summary for WALior ${waliorId} (${history.length} msgs buffered)...`);
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    summaryLocks.add(waliorId);

    try {
        const summaryContent = await generateSummary(history, model);
        // Keep last 10 messages for history persistence
        // If history is longer than 10, take the last 10
        const historyToPersist = history.slice(-10);

        if (summaryContent) {
            console.log(`[Manual-Summary] Generated summary: "${summaryContent.substring(0, 50)}..."`);
            const summaryInput: WaliorSessionSummaryInput = {
                label: `Chat Summary (End of Session) - ${new Date().toISOString()}`,
                content: summaryContent,
                history: historyToPersist
            };
            
            // Persist to Walrus & On-chain
            const { blobId } = await persistWaliorSummary(waliorId, summaryInput);
            console.log(`[Manual-Summary] Summary & History persisted to Walrus (Blob: ${blobId}) and On-Chain.`);
            
            // Clear buffer completely on explicit flush
            sessionHistoryBuffer.delete(waliorId);
            return blobId;
        }
    } catch (err) {
        console.error('Failed to flush session summary:', err);
    } finally {
        summaryLocks.delete(waliorId);
    }
    return null;
}

export async function runWaliorChat(
    request: WaliorChatRequest
): Promise<WaliorChatResponse> {
    const trimmedMessage = request.message ? request.message.trim() : '';
    if (!trimmedMessage) {
        throw new Error('Message is required.');
    }

    // Use skipChainSync: true to avoid re-fetching summary on every chat message
    // We rely on the session state loaded during initialization (Awakening)
    // This dramatically speeds up chat responses
    // We also pass the known latestSummaryBlobId if available, to optimize session creation if cache missed
    const session = await loadWaliorSession({
        waliorId: request.waliorId,
        identityBlobId: request.identityBlobId,
        skipChainSync: true, // Optimization: Use local cache for chat loop
        latestSummaryBlobId: request.latestSummaryBlobId // Optimization: Use known blob ID if cache missed
    });

    // 1. Retrieve recent history from buffer OR from session if buffer empty
    // If the client provided recentHistory (e.g. from state), use that to seed the buffer if empty
    // This helps in case of server restart where session history is lost but client has it
    let history = sessionHistoryBuffer.get(request.waliorId);
    if (!history) {
        if (request.recentHistory && request.recentHistory.length > 0) {
             history = request.recentHistory;
             // Also update session.recentHistory so it's consistent
             session.recentHistory = history;
        } else {
             history = session.recentHistory || [];
        }
        sessionHistoryBuffer.set(request.waliorId, history);
    }

    // 2. Retrieve RAG context
    const limit = typeof request.limit === 'number' ? request.limit : 5;
    const ragResults = await session.ragManager.search(trimmedMessage, limit, 0.55);
    const contextSection = buildContextSection(ragResults);
    const systemPrompt = buildSystemPrompt(session.identity);
    
    const userPrompt = [
        'Respond as the WALior with grounded references.',
        'Player message:',
        trimmedMessage,
        '',
        'Walrus context (Long-term Memory):',
        contextSection,
    ].join('\n');

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    
    // 3. Generate Answer
    // Use history in OpenAI call
    const answer = await callOpenAIChat(systemPrompt, userPrompt, history, model);

    // 4. Update History Buffer
    // Cast role to ChatMessage['role']
    history.push({ role: 'user', content: trimmedMessage });
    history.push({ role: 'assistant', content: answer });
    
    // 5. Check for summarization trigger
    // We summarize roughly every N exchanges (2N messages)
    if (history.length >= SUMMARY_THRESHOLD * 2) {
        if (summaryLocks.has(request.waliorId)) {
             console.log(`[Auto-Summary] Threshold reached but summary already in progress. Skipping.`);
        } else {
            console.log(`[Auto-Summary] Threshold reached (${history.length} msgs). Scheduling async summary for WALior ${request.waliorId}...`);
            
            // ASYNC FIRE-AND-FORGET
            // We do NOT await this promise, allowing the chat response to return immediately.
            // The background process will handle summarization, Walrus upload, and on-chain update.
            (async () => {
                // Acquire lock
                summaryLocks.add(request.waliorId);
                try {
                    const summaryContent = await generateSummary(history, model);
                    if (summaryContent) {
                        console.log(`[Auto-Summary] Generated summary: "${summaryContent.substring(0, 50)}..."`);
                        
                        // Save last 10 messages alongside summary
                        const historyToPersist = history.slice(-10);

                        const summaryInput: WaliorSessionSummaryInput = {
                            label: `Chat Summary - ${new Date().toISOString()}`,
                            content: summaryContent,
                            history: historyToPersist
                        };
                        
                        // Persist to Walrus & On-chain
                        const { blobId } = await persistWaliorSummary(request.waliorId, summaryInput);
                        console.log(`[Auto-Summary] Summary persisted to Walrus (Blob: ${blobId}) and On-Chain.`);
                        
                        // Note: We need to be careful modifying the 'history' array here as it's a reference
                        // held in sessionHistoryBuffer. However, since we are slicing it *after* 
                        // this async block starts, we need to ensure thread safety effectively.
                        // JavaScript is single-threaded, but concurrent requests could be an issue.
                        // For now, we will simply slice it here.
                        const buffer = sessionHistoryBuffer.get(request.waliorId);
                        if (buffer && buffer.length >= SUMMARY_THRESHOLD * 2) {
                             // Keep last 2 messages for continuity
                             const newBuffer = buffer.slice(-2);
                             sessionHistoryBuffer.set(request.waliorId, newBuffer);
                        }
                    }
                } catch (err) {
                    console.error('Failed to generate/persist summary (async):', err);
                } finally {
                    summaryLocks.delete(request.waliorId);
                }
            })();
        }
    } else {
        sessionHistoryBuffer.set(request.waliorId, history);
    }

    return {
        answer,
        context: mapContext(ragResults),
        summaryBlobId: undefined, // No longer returned synchronously as upload is async
    };
}
