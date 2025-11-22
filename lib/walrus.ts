import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { walrus, WalrusFile } from '@mysten/walrus';
import type { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getFullnodeUrl } from '@mysten/sui/client';
import { executeOwnerTransaction } from './transactions';
import type { UploadRelayConfig } from '@mysten/walrus';
import { BlobReader } from '@mysten/walrus/dist/esm/files/readers/blob.js';
import { QuiltReader } from '@mysten/walrus/dist/esm/files/readers/quilt.js';

const OWNER = process.env.ADMIN_ADDRESS || '';
const OWNER_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY || '';

export type Network = 'testnet' | 'mainnet';

export let OWNER_KEYPAIR: Ed25519Keypair;
try {
    if (OWNER_PRIVATE_KEY) {
        OWNER_KEYPAIR = Ed25519Keypair.fromSecretKey(OWNER_PRIVATE_KEY);
    } else {
        console.warn("ADMIN_PRIVATE_KEY is missing in environment variables (walrus.ts).");
        OWNER_KEYPAIR = Ed25519Keypair.generate();
    }
} catch (e) {
    console.error("Failed to create keypair from ADMIN_PRIVATE_KEY", e);
    OWNER_KEYPAIR = Ed25519Keypair.generate();
}

const DEFAULT_UPLOAD_RELAY_HOSTS: Record<Network, string> = {
  testnet: 'https://upload-relay.testnet.walrus.space',
  mainnet: 'https://upload-relay.mainnet.walrus.space',
};

const DEFAULT_TESTNET_AGGREGATORS = [
  'http://cs74th801mmedkqu25ng.bdnodes.net:8443',
  'http://walrus-storage.testnet.nelrann.org:9000',
  'http://walrus-testnet.equinoxdao.xyz:9000',
  'http://walrus-testnet.suicore.com:9000',
  'https://agg.test.walrus.eosusa.io',
  'https://aggregator.testnet.walrus.atalma.io',
  'https://aggregator.testnet.walrus.mirai.cloud',
  'https://aggregator.walrus-01.tududes.com',
  'https://aggregator.walrus-testnet.h2o-nodes.com',
  'https://aggregator.walrus-testnet.walrus.space',
  'https://aggregator.walrus.banansen.dev',
  'https://aggregator.walrus.testnet.mozcomputing.dev',
  'https://sm1-walrus-testnet-aggregator.stakesquid.com',
  'https://sui-walrus-tn-aggregator.bwarelabs.com',
  'https://suiftly-testnet-agg.mhax.io',
  'https://testnet-aggregator-walrus.kiliglab.io',
  'https://testnet-aggregator.walrus.graphyte.dev',
  'https://testnet-walrus.globalstake.io',
  'https://testnet.aggregator.walrus.silentvalidator.com',
  'https://wal-aggregator-testnet.staketab.org',
  'https://walrus-agg-test.bucketprotocol.io',
  'https://walrus-agg-testnet.chainode.tech:9002',
  'https://walrus-agg.testnet.obelisk.sh',
  'https://walrus-aggregator-testnet.cetus.zone',
  'https://walrus-aggregator-testnet.haedal.xyz',
  'https://walrus-aggregator-testnet.n1stake.com',
  'https://walrus-aggregator-testnet.staking4all.org',
  'https://walrus-aggregator-testnet.suisec.tech',
  'https://walrus-aggregator.thcloud.dev',
  'https://walrus-test-aggregator.thepassivetrust.com',
  'https://walrus-testnet-aggregator-1.zkv.xyz',
  'https://walrus-testnet-aggregator.brightlystake.com',
  'https://walrus-testnet-aggregator.chainbase.online',
  'https://walrus-testnet-aggregator.chainflow.io',
  'https://walrus-testnet-aggregator.crouton.digital',
  'https://walrus-testnet-aggregator.dzdaic.com',
  'https://walrus-testnet-aggregator.everstake.one',
  'https://walrus-testnet-aggregator.luckyresearch.org',
  'https://walrus-testnet-aggregator.natsai.xyz',
  'https://walrus-testnet-aggregator.nodeinfra.com',
  'https://walrus-testnet-aggregator.nodes.guru',
  'https://walrus-testnet-aggregator.redundex.com',
  'https://walrus-testnet-aggregator.rpc101.org',
  'https://walrus-testnet-aggregator.rubynodes.io',
  'https://walrus-testnet-aggregator.stakecraft.com',
  'https://walrus-testnet-aggregator.stakeengine.co.uk',
  'https://walrus-testnet-aggregator.stakely.io',
  'https://walrus-testnet-aggregator.stakeme.pro',
  'https://walrus-testnet-aggregator.stakin-nodes.com',
  'https://walrus-testnet-aggregator.stakingdefenseleague.com',
  'https://walrus-testnet-aggregator.starduststaking.com',
  'https://walrus-testnet-aggregator.talentum.id',
  'https://walrus-testnet-aggregator.trusted-point.com',
  'https://walrus-testnet.blockscope.net',
  'https://walrus-testnet.lionscraft.blockscape.network:9000',
  'https://walrus-testnet.validators.services.kyve.network/aggregate',
  'https://walrus-testnet.veera.com',
  'https://walrus-tn.juicystake.io:9443',
  'https://walrus.testnet.aggregator.stakepool.dev.br',
  'https://walrusagg.testnet.pops.one',
];

const DEFAULT_AGGREGATORS: Partial<Record<Network, string[]>> = {
  testnet: DEFAULT_TESTNET_AGGREGATORS,
};

const PREFERRED_AGGREGATORS: Partial<Record<Network, string>> = {
  testnet: 'https://testnet-aggregator.walrus.graphyte.dev',
};

let lastResolvedNetwork: Network = 'testnet';

const DEFAULT_UPLOAD_RELAY_TIP_MAX = 1_000;
const DEFAULT_AGGREGATOR_TIMEOUT_MS = 15_000;

export interface WalrusClientConfig {
  network?: Network;
  packageConfig?: {
    systemObjectId: string;
    stakingPoolId: string;
  };
  storageNodeClientOptions?: {
    fetch?: (url: string | URL, options?: RequestInit) => Promise<Response>;
    timeout?: number;
    onError?: (error: Error) => void;
  };
  /**
   * Explicit upload relay configuration. Set to null to opt out.
   */
  uploadRelay?: UploadRelayConfig | null;
}

export interface WriteFilesOptions {
  files: WalrusFile[];
  epochs: number;
  deletable: boolean;
  signer: Ed25519Keypair;
}

export interface WriteFilesResult {
  id: string;
  blobId: string;
  blobObject: {
    id: {
      id: string;
    };
    registered_epoch: number;
    blob_id: string;
    size: string;
    encoding_type: number;
  };
}

export interface QuiltPatchReadResult {
  contents: Uint8Array;
  identifier?: string;
  tags?: Record<string, string>;
}

export interface QuiltPatchSummary {
  patchId: string;
  quiltId: string;
  identifier?: string;
  tags?: Record<string, string>;
}

export function createWalrusClient(config?: WalrusClientConfig) {
  const network = config?.network || 'testnet';
  lastResolvedNetwork = network;
  
  const client = new SuiJsonRpcClient({
    url: getFullnodeUrl(network),
    network: network,
  });

  const walrusConfig: any = {};
  
  if (config?.packageConfig) {
    walrusConfig.packageConfig = config.packageConfig;
  }
  
  if (config?.storageNodeClientOptions) {
    walrusConfig.storageNodeClientOptions = config.storageNodeClientOptions;
  }

  const uploadRelayConfig = resolveUploadRelayConfig(network, config);

  if (uploadRelayConfig) {
    walrusConfig.uploadRelay = uploadRelayConfig;
  }

  return client.$extend(walrus(walrusConfig));
}

export function createBasicWalrusClient() {
  return createWalrusClient({ network: 'testnet' });
}

function resolveUploadRelayConfig(network: Network, config?: WalrusClientConfig): UploadRelayConfig | undefined {
  if (config && Object.prototype.hasOwnProperty.call(config, 'uploadRelay') && config.uploadRelay === null) {
    return undefined;
  }

  if (config?.uploadRelay) {
    return config.uploadRelay;
  }

  const host = getUploadRelayHost(config?.network || network);

  if (!host) {
    return undefined;
  }

  const tipMax = getUploadRelayTipMax();
  const relayConfig: UploadRelayConfig = {
    host,
  };

  const resolvedTipMax = typeof tipMax === 'number' ? tipMax : DEFAULT_UPLOAD_RELAY_TIP_MAX;

  relayConfig.sendTip = {
    max: resolvedTipMax,
  };

  return relayConfig;
}

function getUploadRelayHost(network: Network): string | undefined {
  const envHost =
    process.env.NEXT_PUBLIC_WALRUS_UPLOAD_RELAY_HOST ||
    process.env.WALRUS_UPLOAD_RELAY_HOST;

  if (envHost && envHost.length > 0) {
    return envHost;
  }

  return DEFAULT_UPLOAD_RELAY_HOSTS[network];
}

function getUploadRelayTipMax(): number | undefined {
  const value =
    process.env.NEXT_PUBLIC_WALRUS_UPLOAD_RELAY_TIP_MAX ||
    process.env.WALRUS_UPLOAD_RELAY_TIP_MAX;

  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
}

function getAggregatorTimeout(): number {
  const value =
    process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_TIMEOUT_MS ||
    process.env.WALRUS_AGGREGATOR_TIMEOUT_MS;

  if (!value) {
    return DEFAULT_AGGREGATOR_TIMEOUT_MS;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_AGGREGATOR_TIMEOUT_MS;
  }

  return parsed;
}

function tryResolveAggregatorUrl(): string | undefined {
  const envOverride =
    process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL ||
    process.env.WALRUS_AGGREGATOR_URL;

  if (envOverride && envOverride.length > 0) {
    return envOverride;
  }

  const preferred = PREFERRED_AGGREGATORS[lastResolvedNetwork];

  if (preferred) {
    return preferred;
  }

  const defaults = DEFAULT_AGGREGATORS[lastResolvedNetwork];

  if (!defaults || defaults.length === 0) {
    return undefined;
  }

  const randomIndex = Math.floor(Math.random() * defaults.length);
  return defaults[randomIndex];
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

async function tryReadBlobFromAggregator(blobId: string): Promise<Uint8Array | null> {
  const aggregatorUrl = tryResolveAggregatorUrl();

  if (!aggregatorUrl) {
    return null;
  }

  const normalizedBase = normalizeBaseUrl(aggregatorUrl);
  const url = `${normalizedBase}/v1/blobs/${encodeURIComponent(blobId)}`;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = getAggregatorTimeout();
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeout) : null;

  try {
    const response = await fetch(url, controller ? { signal: controller.signal } : undefined);

    if (!response.ok) {
      throw new Error(`Aggregator responded with ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (error) {
    console.warn('[walrus] Aggregator read failed, falling back to SDK', error);
    return null;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

type QuiltPatchReference =
  | { kind: 'patchId'; patchId: string }
  | { kind: 'identifier'; quiltId: string; identifier: string };

function parseQuiltPatchReference(value: string): QuiltPatchReference {
  const delimiter = '::';
  const index = value.indexOf(delimiter);

  if (index > 0) {
    const quiltId = value.slice(0, index);
    const identifier = value.slice(index + delimiter.length);

    if (quiltId && identifier) {
      return { kind: 'identifier', quiltId, identifier };
    }
  }

  return { kind: 'patchId', patchId: value };
}

async function tryReadQuiltPatchFromAggregator(
  reference: QuiltPatchReference
): Promise<QuiltPatchReadResult | null> {
  const aggregatorUrl = tryResolveAggregatorUrl();

  if (!aggregatorUrl) {
    return null;
  }

  const normalizedBase = normalizeBaseUrl(aggregatorUrl);
  const url =
    reference.kind === 'patchId'
      ? `${normalizedBase}/v1/blobs/by-quilt-patch-id/${encodeURIComponent(reference.patchId)}`
      : `${normalizedBase}/v1/blobs/by-quilt-id/${encodeURIComponent(reference.quiltId)}/${encodeURIComponent(reference.identifier)}`;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = getAggregatorTimeout();
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeout) : null;

  try {
    const response = await fetch(url, controller ? { signal: controller.signal } : undefined);

    if (!response.ok) {
      throw new Error(`Aggregator responded with ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const identifier = response.headers.get('X-Quilt-Patch-Identifier') ?? undefined;

    return {
      contents: new Uint8Array(buffer),
      identifier,
    };
  } catch (error) {
    console.warn('[walrus] Aggregator quilt patch read failed, falling back to SDK', error);
    return null;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function readWalrusFiles(
  client: ReturnType<typeof createWalrusClient>,
  ids: string[]
): Promise<WalrusFile[]> {
  return await client.walrus.getFiles({ ids });
}

export async function readWalrusFile(
  client: ReturnType<typeof createWalrusClient>,
  id: string
): Promise<WalrusFile> {
  const [file] = await client.walrus.getFiles({ ids: [id] });
  return file;
}

export async function getFileBytes(file: WalrusFile): Promise<Uint8Array> {
  return await file.bytes();
}

export async function getFileText(file: WalrusFile): Promise<string> {
  return await file.text();
}

export async function getFileJson<T = any>(file: WalrusFile): Promise<T> {
  return await file.json();
}

export async function getFileIdentifier(file: WalrusFile): Promise<string | null> {
  return await file.getIdentifier();
}

export async function getFileTags(file: WalrusFile): Promise<Record<string, string>> {
  return await file.getTags();
}


export function createWalrusFileFromBytes(
  contents: Uint8Array,
  identifier?: string,
  tags?: Record<string, string>
): WalrusFile {
  return WalrusFile.from({
    contents,
    identifier: identifier || '',
    tags,
  });
}

export function createWalrusFileFromBlob(
  contents: Blob,
  identifier?: string,
  tags?: Record<string, string>
): WalrusFile {
  return WalrusFile.from({
    contents,
    identifier: identifier || '',
    tags,
  });
}

export function createWalrusFileFromString(
  contents: string,
  identifier?: string,
  tags?: Record<string, string>
): WalrusFile {
  return WalrusFile.from({
    contents: new TextEncoder().encode(contents),
    identifier: identifier || '',
    tags,
  });
}

export async function writeWalrusFiles(
  client: ReturnType<typeof createWalrusClient>,
  options: WriteFilesOptions
): Promise<WriteFilesResult[]> {
  return await client.walrus.writeFiles({
    files: options.files,
    epochs: options.epochs,
    deletable: options.deletable,
    signer: options.signer,
  });
}

export async function writeWalrusFile(
  client: ReturnType<typeof createWalrusClient>,
  file: WalrusFile,
  epochs: number,
  deletable: boolean,
  signer: Ed25519Keypair
): Promise<WriteFilesResult> {
  const results = await writeWalrusFiles(client, {
    files: [file],
    epochs,
    deletable,
    signer: signer
  });
  return results[0];
}

export async function writeWalrusBlob(
  client: ReturnType<typeof createWalrusClient>,
  blob: Uint8Array,
  epochs: number,
  deletable: boolean,
  signer: Ed25519Keypair
): Promise<{ blobId: string }> {
  return await client.walrus.writeBlob({
    blob,
    deletable,
    epochs,
    signer,
  });
}

export async function readWalrusBlob(
  client: ReturnType<typeof createWalrusClient>,
  blobId: string
): Promise<Uint8Array> {
  const aggregatorBlob = await tryReadBlobFromAggregator(blobId);

  if (aggregatorBlob) {
    return aggregatorBlob;
  }

  return await client.walrus.readBlob({ blobId });
}

export async function listQuiltPatches(
  client: ReturnType<typeof createWalrusClient>,
  blobId: string
): Promise<QuiltPatchSummary[]> {
  try {
    const blob = await client.walrus.getBlob({ blobId });
    const files = await blob.files();
    const summaries: QuiltPatchSummary[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const identifier = (await file.getIdentifier()) || `patch-${i + 1}`;
      const tags = await file.getTags();
      summaries.push({
        patchId: `${blobId}::${identifier}`,
        identifier,
        tags,
        quiltId: blobId,
      });
    }

    return summaries;
  } catch (error) {
    console.warn('[walrus] Failed to list quilt patches', error);
    return [];
  }
}

export async function readWalrusQuiltPatch(
  client: ReturnType<typeof createWalrusClient>,
  patchId: string
): Promise<QuiltPatchReadResult> {
  const reference = parseQuiltPatchReference(patchId);
  const aggregatorResult = await tryReadQuiltPatchFromAggregator(reference);

  if (aggregatorResult) {
    return aggregatorResult;
  }

  if (reference.kind === 'patchId') {
    const files = await client.walrus.getFiles({ ids: [reference.patchId] });

    if (!files.length) {
      throw new Error('Quilt patch not found');
    }

    const file = files[0];
    const [contents, identifier, tags] = await Promise.all([
      file.bytes(),
      file.getIdentifier(),
      file.getTags(),
    ]);

    return {
      contents,
      identifier: identifier || undefined,
      tags,
    };
  }

  const blob = await client.walrus.getBlob({ blobId: reference.quiltId });
  const files = await blob.files({ identifiers: [reference.identifier] });

  if (!files.length) {
    throw new Error('Quilt patch not found');
  }

  const file = files[0];
  const [contents, identifier, tags] = await Promise.all([
    file.bytes(),
    file.getIdentifier(),
    file.getTags(),
  ]);

  return {
    contents,
    identifier: identifier || undefined,
    tags,
  };
}

export function deleteWalrusBlobTx(
  client: ReturnType<typeof createWalrusClient>,
  blobId: string,
): Transaction {
   const tx = client.walrus.deleteBlobTransaction({ blobObjectId: blobId, owner: OWNER });
   tx.setSender(OWNER);
   return tx;
}

export async function deleteWalrusBlob(
  client: ReturnType<typeof createWalrusClient>,
  blobId: string,
): Promise<{ digest: string }> {
  const transaction = deleteWalrusBlobTx(client, blobId);
  const { digest } = await executeOwnerTransaction(transaction);
  console.log(digest);
  return { digest };
}
