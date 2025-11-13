import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { walrus, WalrusFile } from '@mysten/walrus';
import type { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getFullnodeUrl } from '@mysten/sui/client';
import { executeOwnerTransaction } from './transactions';

const OWNER = '0x8fe1368e8c8fad5d45f2470a4b05d66cdf08288872e4ba0654ffb8de123c0856';

export type Network = 'testnet' | 'mainnet' | 'devnet' | 'localnet';

export const OWNER_KEYPAIR : Ed25519Keypair = Ed25519Keypair.fromSecretKey('suiprivkey1qp4dm5p4hcdsxzvcjhhngtm53rg3hpmm03ay0h3w39lynxe200quszem5cf');


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

export function createWalrusClient(config?: WalrusClientConfig) {
  const network = config?.network || 'testnet';
  
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

  return client.$extend(walrus(walrusConfig));
}

export function createBasicWalrusClient() {
  return createWalrusClient({ network: 'testnet' });
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
  return await client.walrus.readBlob({ blobId });
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




