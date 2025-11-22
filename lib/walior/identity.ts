import { randomUUID } from 'node:crypto';
import {
    createBasicWalrusClient,
    createWalrusFileFromString,
    writeWalrusFile,
    OWNER_KEYPAIR,
} from '@/lib/walrus';
import type {
    CreateWaliorIdentityOptions,
    UploadWaliorIdentityOptions,
    WaliorIdentity,
} from './types';

const FANTASY_CLASSES = [
    'Tide Warrior', 'Storm Cleric', 'Rune Mage', 'Abyss Walker', 'Relic Hunter',
    'Shadow Rogue', 'Ice Paladin', 'Tech Necromancer', 'Wind Archer', 'Beast Tamer',
    'Navigator Bard', 'Deep Druid', 'Corsair Duelist', 'Glimmer Alchemist', 'Void Mystic'
];

const LORE_FACTIONS = [
    {
        name: 'The Lighthouse Covenant',
        description: 'An order of scholars and lightkeepers who believe light is knowledge.',
        traits: ['seeks hidden truths', 'values history', 'meticulous observer', 'fearful of the dark'],
        allies: ['Aurora Mechanists', 'Stormforged Guild'],
        rivals: ['Obsidian Tide'],
        backgrounds: [
            'Former beacon-keeper of the Northern Spire.',
            'Scribe who fled the library of burning books.',
            'Cartographer of the shifting ice shelves.',
        ]
    },
    {
        name: 'The Obsidian Tide',
        description: 'Deep-sea divers and scavengers who commune with leviathans.',
        traits: ['comfortable in silence', 'speaks in riddles', 'hoards ancient scraps', 'distrusts the sky'],
        allies: ['Blackwake Corsairs'],
        rivals: ['Lighthouse Covenant', 'Stormforged Guild'],
        backgrounds: [
            'Survivor of a submarine crash in the Whispering Abyss.',
            'Exiled diver who saw something they shouldn\'t have.',
            'Salvager of sunken ironclad warships.',
        ]
    },
    {
        name: 'The Stormforged Guild',
        description: 'Mercenaries and monster hunters who value strength and honor.',
        traits: ['bold and brash', 'loyal to the coin', 'tells tall tales', 'never backs down'],
        allies: ['Lighthouse Covenant'],
        rivals: ['Obsidian Tide', 'Blackwake Corsairs'],
        backgrounds: [
            'Veteran harpooner of the Great White Whale hunt.',
            'Disgraced captain seeking redemption.',
            'Deckhand on the ironclad "Thunderhead".',
        ]
    },
    {
        name: 'The Aurora Mechanists',
        description: 'Inventors who harness the aurora for their flying machines.',
        traits: ['head in the clouds', 'fascinated by machinery', 'speaks in technobabble', 'optimistic dreamer'],
        allies: ['Lighthouse Covenant'],
        rivals: ['Luddite Pirates'],
        backgrounds: [
            'Engineer who crashed their skyship in the tundra.',
            'Clockmaker searching for the eternal spring.',
            'Drone pilot who lost their connection to the swarm.',
        ]
    }
];

const FIRST_NAMES = [
    'Thora', 'Kaelen', 'Yorick', 'Elara', 'Finn', 'Isolde', 'Magnus', 'Seraphina', 'Oric', 'Lyra',
    'Bran', 'Sia', 'Vorn', 'Elowen', 'Torin', 'Kaida', 'Rurik', 'Freya', 'Stellan', 'Maren',
    'Bjorne', 'Astrid', 'Leif', 'Sigrid', 'Gunnar', 'Ingrid', 'Vidar', 'Solveig'
];

const LAST_NAMES = [
    'Deepwalker', 'Stormborn', 'Salt-Eyed', 'Frostweaver', 'Ironheart', 'Tidecaller', 'Windrider', 'Shard-Seeker',
    'Blackwater', 'Ice-Vein', 'Beacon-Light', 'Abyss-Gazer', 'Rune-Carver', 'Mist-Walker', 'Hull-Breaker',
    'Sky-Watcher', 'Wave-Crasher', 'Anchor-Drag', 'Net-Mender', 'Star-Guide'
];

function pickRandom<T>(values: readonly T[]): T {
    const index = Math.floor(Math.random() * values.length);
    return values[index];
}

function generateWaliorName(seed?: string): string {
    if (seed && seed.trim().length > 0) {
        return seed.trim();
    }
    return `${pickRandom(FIRST_NAMES)} ${pickRandom(LAST_NAMES)}`;
}

export function createWaliorIdentity(
    options?: CreateWaliorIdentityOptions
): WaliorIdentity {
    const name = generateWaliorName(options?.seedName);
    
    // Select a faction to base the identity around
    const faction = pickRandom(LORE_FACTIONS);
    
    // Pick a random fantasy class
    const fantasyClass = pickRandom(FANTASY_CLASSES);

    const archetype = options?.archetype && options.archetype.length > 0
        ? options.archetype
        : `${faction.name} ${fantasyClass}`;

    const personaTraits: string[] = [];
    // Pick 2 faction traits
    while (personaTraits.length < 2) {
        const trait = pickRandom(faction.traits);
        if (!personaTraits.includes(trait)) {
            personaTraits.push(trait);
        }
    }
    // Pick 1 random general trait
    const GENERAL_TRAITS = ['lucky', 'superstitious', 'always hungry', 'hums constantly', 'collects shiny stones', 'fears birds'];
    personaTraits.push(pickRandom(GENERAL_TRAITS));

    const origin = pickRandom(faction.backgrounds);
    
    const goalPrefixes = ['Find', 'Protect', 'Destroy', 'Catalog', 'Understand', 'Escape'];
    const goalTargets = ['the Lost City of Aethelgard', 'the Source of the Green Fire', 'the last pure-water spring', 'the legendary Kraken', 'the Ghost Ship "Revenant"'];
    
    const goals = [
        `${pickRandom(goalPrefixes)} ${pickRandom(goalTargets)}`,
        `Rise in the ranks of ${faction.name}`,
        `Uncover the truth about ${pickRandom(['the Great Thaw', 'the Night of Green Fire', 'the Whisker-Stones'])}`
    ];

    const motto = pickRandom([
        'The tide waits for no one.',
        'Iron rusts, but will endures.',
        'Light reveals what shadow hides.',
        'To the depths, and back again.',
        'The sky is the limit.',
        'Trust in the Shard.',
        'Beware the whisper in the dark.'
    ]);

    const systemPrompt = [
        `IDENTITY: You are ${name}, a ${archetype} from Oceanus Borealis.`,
        `CLASS: ${fantasyClass}`,
        `WORLD: A cold, magitech ocean world with islands, icebergs, and ancient ruins. Ancient "Relics" power technology.`,
        `FACTION: You are aligned with ${faction.name}. Beliefs: ${faction.description}`,
        `PERSONALITY: You are ${personaTraits.join(', ')}.`,
        `BACKGROUND: ${origin}`,
        `GOALS: ${goals.join('; ')}.`,
        `LANGUAGE: Speak in a fantasy-nautical style. Use terms like "Whisker-Stones" for relays, "Memory-Urns" for data, "Communing" for uploading.`,
        `CONSTRAINTS:`,
        `- NEVER break character. You are in a fantasy world. Do not mention "AI", "LLM", "server", or real-world tech.`,
        `- Answers must be SHORT. Maximum 3 sentences.`,
        `- Be helpful but stay grounded in the lore.`,
        `- If asked about modern tech, interpret it through your world's lens (e.g., "internet" -> "the great ley-line web").`
    ].join('\n');

    return {
        version: 2, // Bumped version
        name,
        archetype,
        persona: {
            demeanor: pickRandom(['stoic', 'jovial', 'mysterious', 'grumpy', 'curious', 'paranoid']),
            motto,
            traits: personaTraits,
            goals: goals,
        },
        lore: {
            origin,
            notableAllies: [
                pickRandom(faction.allies),
                pickRandom(faction.allies) || 'Free Traders',
            ],
            rivalries: [
                pickRandom(faction.rivals),
            ],
        },
        chat: {
            systemPrompt,
            guardrails: [
                'Max 3 sentences per response',
                'Stay in fantasy character',
                'No real-world tech references',
                'Use lore-specific terminology'
            ],
            quickFacts: [
                `Faction: ${faction.name}`,
                `Class: ${fantasyClass}`,
                `Origin: ${origin}`,
                `Trait: ${personaTraits[0]}`,
            ],
        },
        memorySources: [],
        curatedSummaries: [],
    };
}

export async function uploadWaliorIdentity(
    options?: UploadWaliorIdentityOptions
): Promise<{
    identity: WaliorIdentity;
    blobId: string;
}> {
    const identity = createWaliorIdentity(options);
    // Create the payload cleanly, ensuring no extra fields are added at the root level if not intended
    const payload = JSON.stringify({
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        identity,
    }, null, 2);

    const client = createBasicWalrusClient();
    const walrusFile = createWalrusFileFromString(
        payload,
        identity.name,
        {
            'content-type': 'application/json',
            'walior-name': identity.name,
        }
    );

    const writeResult = await writeWalrusFile(
        client,
        walrusFile,
        options?.epochs ?? 3,
        options?.deletable ?? false,
        OWNER_KEYPAIR
    );

    return {
        identity,
        blobId: writeResult.blobId,
    };
}
