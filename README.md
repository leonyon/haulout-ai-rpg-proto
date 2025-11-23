# WALiors (Haulout Hackathon Build)

AI-driven roguelite where every WALior you mint on Sui carries a persistent identity, memory, and dungeon history. The entire experience—from lore to inventories to chat logs—is stored in decentralized Walrus blobs referenced on-chain. No centralized database, no throwaway AI prompts.

---

## Core Pillars

- **Fully decentralized storage**: WALior identities, chat transcripts, and RPG saves live in Walrus quilts. Each WALior keeps a Master Index blob pointing to the latest summary, active run, and historic achievements, with on-chain registry entries tracking blob IDs.
- **Sui-native ownership**: Minting, session tracking, and save pointers are managed through Sui objects. Users can summon up to four WALiors per address; everything runs on testnet for this prototype.
- **Retrieval-Augmented Generation**: The AI Game Master (OpenAI GPT-4o-mini) retrieves WALior identity facts, recent dungeon turns, and curated memories via `@xenova/transformers` embeddings before writing the next scene. Choice hallucinations are prevented by enforcing `requiredItem` metadata.
- **Persistent RPG + Chat**: Game interface renders rich Markdown narratives, ambient gradients, and validated choices. Chat console includes Save & Close with spinner/status updates, forcing Walrus + registry confirmation before dismissal.
- **Deploy-friendly**: ONNX runtimes are shimmed to WASM with CDN-delivered artifacts cached under `/tmp/haulout-cache` or `.cache/`. The app avoids native binaries, enabling clean Vercel deployments.

---

## Feature Tour

### WALior Lifecycle
1. **Connect Wallet** via `@mysten/dapp-kit` (testnet only).
2. **Mint** to generate lore + image, upload identity blob to Walrus, and register on-chain.
3. **Select WALior** to view archetype, traits, run stats, and launch the dungeon.

### Game Flow
- **Prompting**: `lib/game/prompts.ts` enforces multi-paragraph responses, semantic Markdown, and forbids low-effort prompts like “What will you do?”
- **Engine**: `lib/game/engine.ts` appends AI turns to the full log, filters invalid choices, and injects fallback options when inventory constraints remove every path.
- **UI**: `app/components/GameInterface.tsx` renders the latest log entry with `react-markdown + remark-gfm`, animates ambient gradients, and provides Save & Exit with upload status.

### Chat + Memory
- **Hydration**: Every chat session rehydrates from Walrus (no local-only cache). `sanitizeHistory` ensures histories end on AI messages.
- **Save & Close**: Calls `/api/walior/summary`, waits for Walrus + registry writes, shows progress text (“Generating summary…”, “Uploading to Walrus…”), then closes.
- **Invalidation**: After persistence, session caches are cleared to force fresh loads next time.

### RAG + Embeddings
- `lib/rag/embedding.ts` downloads ONNX WASM binaries on demand and sets transformer env paths.
- `lib/rag/rag-manager.ts` stores embeddings under `.cache/` (ignored by Git) or `/tmp` in prod.
- Each WALior gets a scoped embedding store used for both chat summarization and Game Master context assembly.

---

## Development

```bash
npm install
npm run dev
# lint/type-check
npm run lint
npm run build
```

Environment essentials:
| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | AI Game Master + chat summaries |
| `WALRUS_BASE_URL`, `WALRUS_API_KEY` | Walrus blob writes |
| `NEXT_PUBLIC_TRANSFORMERS_VERSION` | Optional pin for CDN WASM |

---

## Deployment Notes

- Vercel-ready configuration (`next.config.ts`) with WASM experiments and shims for `onnxruntime-node`.
- `public/walior.ico` defined as the site icon in `app/layout.tsx`.
- `.cache/` ignored by Git; serverless caches live under `/tmp/haulout-cache`.
- Production always forces Sui testnet endpoints.

---

## Roadmap Ideas

- Cooperative WALior parties sharing memory shards.
- Player-authored inscriptions added to the RAG corpus.
- Spectator playback with redacted inventories.

Built entirely for the **Haulout hackathon** to showcase decentralized AI gaming on Sui + Walrus. Descend carefully—The Sunken Spire remembers everything. 
