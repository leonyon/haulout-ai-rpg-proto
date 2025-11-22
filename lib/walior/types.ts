export interface WaliorPersona {
    demeanor: string;
    motto: string;
    traits: string[];
    goals: string[];
}

export interface WaliorLore {
    origin: string;
    notableAllies: string[];
    rivalries: string[];
}

export interface WaliorChatProfile {
    systemPrompt: string;
    guardrails: string[];
    quickFacts: string[];
}

export type WaliorMemorySourceKind = 'blob' | 'quiltPatch';

export interface WaliorMemorySource {
    id: string;
    kind: WaliorMemorySourceKind;
    blobId?: string;
    patchId?: string;
    description?: string;
}

export interface WaliorCuratedSummary {
    label: string;
    content: string;
    timestamp: string;
}

export interface WaliorIdentity {
    version: number;
    name: string;
    archetype: string;
    persona: WaliorPersona;
    lore: WaliorLore;
    chat: WaliorChatProfile;
    memorySources: WaliorMemorySource[];
    curatedSummaries: WaliorCuratedSummary[];
}

export interface CreateWaliorIdentityOptions {
    seedName?: string;
    archetype?: string;
}

export interface UploadWaliorIdentityOptions extends CreateWaliorIdentityOptions {
    epochs?: number;
    deletable?: boolean;
}

export interface WaliorRegistryEntry {
    objectId: string;
    owner: string;
    name: string;
    identityBlobId: string;
    memorySources: WaliorMemorySource[];
    updatedAt: string;
}

export interface WaliorListItem {
    objectId: string;
    name: string;
    identityBlobId: string;
    owner: string;
    imageUrl?: string;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface WaliorSessionSummaryInput {
    label: string;
    content: string;
    history?: ChatMessage[];
}

export interface WaliorChatRequest {
    waliorId: string;
    identityBlobId: string;
    message: string;
    summary?: WaliorSessionSummaryInput;
    limit?: number;
    recentHistory?: ChatMessage[]; // New field to pass history from client
    latestSummaryBlobId?: string; // New field to pass known summary blob ID
}

export interface WaliorChatResponse {
    answer: string;
    context: Array<{
        id: string;
        similarity: number;
        content: string;
        metadata: Record<string, unknown>;
    }>;
    summaryBlobId?: string;
}
