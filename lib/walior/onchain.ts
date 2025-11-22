import { graphqlClient } from '@/lib/graphql';
import type { WaliorListItem } from './types';
import { Transaction } from '@mysten/sui/transactions';
import { executeOwnerTransaction, client } from '@/lib/transactions';

interface WaliorGraphNode {
    asMoveObject: {
        address: string;
        contents: {
            json: {
                name?: string;
                identity_blob_id?: string;
            };
        } | null;
    } | null;
}

interface WaliorQueryResult {
    objects: {
        nodes: WaliorGraphNode[];
    };
}

export async function fetchWaliorObjects(
    owner: string,
    packageId: string
): Promise<WaliorListItem[]> {
    const trimmedOwner = owner.trim();
    if (!trimmedOwner) {
        throw new Error('Owner address is required.');
    }

    const trimmedPackage = packageId.trim();
    if (!trimmedPackage) {
        throw new Error('WALior package ID is not configured.');
    }

    // This is the core Struct type. The Registry is a separate shared object we don't query by owner.
    const typeTag = `${trimmedPackage}::waliors::WALior`;
    
    const query = `
    query {
        objects(filter: { owner: "${trimmedOwner}", type: "${typeTag}" }) {
            nodes {
                asMoveObject {
                    address
                    contents {
                        json
                    }
                }
            }
        }
    }
    `;

    const response = await graphqlClient.query<WaliorQueryResult>({
        query: query,
        variables: {},
    });

    if (response.errors && response.errors.length > 0) {
        const message = response.errors.map(function collect(error) {
            return error.message;
        }).join(', ');
        throw new Error(message);
    }

    const nodes = response.data?.objects?.nodes || [];
    
    return nodes
        .filter(function filterNode(node) {
            return Boolean(node.asMoveObject && node.asMoveObject.contents && node.asMoveObject.contents.json);
        })
        .map(function mapNode(node) {
            const moveObject = node.asMoveObject!;
            const payload = moveObject.contents!.json || {};
            
            // The Move struct definition is:
            // struct WALior { id: UID, name: String, identity_blob_id: String, generation: u64 }
            // GraphQL returns fields as they are in JSON.
            
            const identity = typeof payload.identity_blob_id === 'string'
                ? payload.identity_blob_id
                : '';
                
            const name = typeof payload.name === 'string'
                ? payload.name
                : moveObject.address;

            return {
                objectId: moveObject.address,
                identityBlobId: identity,
                name,
                owner: trimmedOwner,
            };
        });
}

export async function updateWaliorSummaryOnChain(
    waliorId: string,
    summaryBlobId: string
): Promise<string> {
    const packageId = process.env.WALIOR_PACKAGE_ID;
    const registryId = process.env.WALIOR_REGISTRY_ID;
    const mintAuthId = process.env.WALIOR_MINT_AUTH_ID; // This is actually the AdminAuth ID now

    if (!packageId || !registryId || !mintAuthId) {
        console.warn('Missing env vars for on-chain summary update. Skipping.');
        return '';
    }

    const tx = new Transaction();
    tx.moveCall({
        target: `${packageId}::waliors::update_summary`,
        arguments: [
            tx.object(mintAuthId),
            tx.object(registryId),
            tx.pure.id(waliorId),
            tx.pure.string(summaryBlobId),
            tx.object('0x6'), // Clock
        ],
    });

    const response = await executeOwnerTransaction(tx);
    console.log(`[Registry Update] Successfully updated summary for WALior ${waliorId}. Digest: ${response.digest}`);
    return response.digest;
}

export async function getLatestWaliorSummary(waliorId: string): Promise<string | null> {
    const registryId = process.env.WALIOR_REGISTRY_ID;
    if (!registryId) {
        console.error('[OnChain Read] WALIOR_REGISTRY_ID is not configured.');
        return null;
    }

    console.log(`[OnChain Read] Fetching registry ${registryId} for walior ${waliorId}...`);

    try {
        // 1. Fetch the Registry Object to get the Table ID
        const registryObject = await client.getObject({
            id: registryId,
            options: { showContent: true },
        });

        if (!registryObject.data) {
            console.error('[OnChain Read] Registry object not found or deleted.');
            return null;
        }

        if (!registryObject.data.content || registryObject.data.content.dataType !== 'moveObject') {
            console.error('[OnChain Read] Registry object content is missing or not a moveObject.', registryObject.data);
            return null;
        }

        // fields.waliors should be the Table struct
        const fields = registryObject.data.content.fields as {
            waliors?: {
                fields?: {
                    id?: {
                        id?: string;
                    };
                };
            };
        };
        const tableId = fields.waliors?.fields?.id?.id;

        if (!tableId) {
            console.error('[OnChain Read] Could not find table ID in registry fields:', JSON.stringify(fields, null, 2));
            return null;
        }

        console.log(`[OnChain Read] Registry Table ID found: ${tableId}. Querying dynamic field for ${waliorId}...`);

        // 2. Query the Table using the Walior ID as key
        const tableField = await client.getDynamicFieldObject({
            parentId: tableId,
            name: {
                type: '0x2::object::ID',
                value: waliorId,
            },
        });

        if (!tableField.data) {
             // This usually means the key doesn't exist in the table
            console.warn(`[OnChain Read] Entry for walior ${waliorId} not found in registry table.`);
            return null;
        }

        if (!tableField.data.content || tableField.data.content.dataType !== 'moveObject') {
            console.error('[OnChain Read] Table entry content is missing or invalid.', tableField.data);
            return null;
        }

        const dfFields = tableField.data.content.fields as {
            value?: {
                fields?: {
                    summary_blob_id?: unknown;
                };
            };
        };
        console.log(`[OnChain Read] Found DF wrapper for ${waliorId}:`, JSON.stringify(dfFields, null, 2));

        if (!dfFields.value || !dfFields.value.fields) {
             console.error('[OnChain Read] RegistryEntry value/fields missing in DF wrapper.');
             return null;
        }
        
        const summaryOption = dfFields.value.fields.summary_blob_id;
        
        // Check standard Move Option representation: { type: '0x1::option::Option<...>', fields: { vec: [...] } }
        // Or sometimes simpler JSON if flattened by RPC
        
        // Case A: Standard struct representation
        if (summaryOption && typeof summaryOption === 'object' && 'fields' in summaryOption) {
            const optionObj = summaryOption as { fields: { vec: string[] } };
            if (optionObj.fields?.vec && Array.isArray(optionObj.fields.vec) && optionObj.fields.vec.length > 0) {
                const val = optionObj.fields.vec[0];
                console.log(`[OnChain Read] Found summary_blob_id (Case A): ${val}`);
                return val;
            }
        }
        
        // Case B: Direct null or value (rare for Option in current RPC but possible)
        if (summaryOption === null) {
             console.log('[OnChain Read] summary_blob_id is null (None).');
             return null;
        }
        
        // Case C: Direct string value (Flattened Option<String> where Some(x) -> x)
        if (typeof summaryOption === 'string') {
             console.log(`[OnChain Read] Found summary_blob_id (Case C - Flattened): ${summaryOption}`);
             return summaryOption;
        }

        console.log('[OnChain Read] summary_blob_id (None) or unknown format.', JSON.stringify(summaryOption, null, 2));
        return null;

    } catch (error: unknown) {
        // If getDynamicFieldObject fails because the object isn't found, it might throw an error code
        if (error instanceof Error && error.message && error.message.includes('doesn\'t exist')) { // Check exact error message for "dynamic field not found"
             console.warn(`[OnChain Read] Walior ${waliorId} not found in registry (Dynamic Field missing).`);
             return null;
        }
        
        console.error(`[OnChain Read] Failed to read registry for walior ${waliorId}:`, error);
        return null;
    }
}
