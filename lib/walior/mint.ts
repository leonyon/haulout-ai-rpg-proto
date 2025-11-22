import { Transaction } from '@mysten/sui/transactions';
import { executeOwnerTransaction } from '@/lib/transactions';

interface MintWaliorOptions {
    identityBlobId: string;
    imageBlobId: string;
    receiver: string;
    name: string;
}

export interface MintWaliorResult {
    digest: string;
    waliorObjectId?: string;
}

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value || value.trim().length === 0) {
        throw new Error(`${name} is not configured.`);
    }
    return value.trim();
}

export async function mintWalior(options: MintWaliorOptions): Promise<MintWaliorResult> {
    if (!options.identityBlobId || options.identityBlobId.trim().length === 0) {
        throw new Error('identityBlobId is required to mint a WALior.');
    }

    if (!options.imageBlobId || options.imageBlobId.trim().length === 0) {
        throw new Error('imageBlobId is required to mint a WALior.');
    }

    if (!options.receiver || options.receiver.trim().length === 0) {
        throw new Error('receiver address is required.');
    }

    const packageId = requireEnv('WALIOR_PACKAGE_ID');
    const mintAuthId = requireEnv('WALIOR_MINT_AUTH_ID'); // AdminAuth
    const registryId = requireEnv('WALIOR_REGISTRY_ID');

    const waliorName = options.name && options.name.trim().length > 0
        ? options.name.trim()
        : 'Unnamed WALior';

    const tx = new Transaction();

    // public fun mint_to_address(auth: &mut WALiorAdminAuth, registry: &mut WALiorRegistry, name: String, identity_blob_id: String, image_blob_id: String, receiver: address, clock: &Clock, ctx: &mut TxContext)
    tx.moveCall({
        target: `${packageId}::waliors::mint_to_address`,
        arguments: [
            tx.object(mintAuthId),
            tx.object(registryId),
            tx.pure.string(waliorName),
            tx.pure.string(options.identityBlobId.trim()),
            tx.pure.string(options.imageBlobId.trim()),
            tx.pure.address(options.receiver.trim()),
            tx.object('0x6'), // Clock
        ],
    });

    const response = await executeOwnerTransaction(tx);
    const digest = response.digest;
    let waliorObjectId: string | undefined;

    if (response.effects && Array.isArray(response.effects.created)) {
        for (const created of response.effects.created) {
            if (created.reference && created.reference.objectId && typeof created.reference.objectId === 'string') {
                // Safe check for owner property existance on the union type
                const owner = created.owner;
                if (owner && typeof owner === 'object' && 'AddressOwner' in owner && owner.AddressOwner === options.receiver.trim()) {
                    waliorObjectId = created.reference.objectId;
                    break;
                }
            }
        }
    }

    if (waliorObjectId) {
        console.log(`[Registry Update] WALior "${waliorName}" (${waliorObjectId}) minted and registered on-chain. Digest: ${digest}`);
    }
    
    return {
        digest,
        waliorObjectId,
    };
}
