import { SuiGraphQLClient } from '@mysten/sui/graphql';

const OWNER = process.env.ADMIN_ADDRESS || '0x8fe1368e8c8fad5d45f2470a4b05d66cdf08288872e4ba0654ffb8de123c0856';

export const graphqlClient = new SuiGraphQLClient({
    url: "https://graphql.testnet.sui.io/graphql"
});

/**
 * Converts a decimal blob ID string to URL-safe Base64 without padding
 * The blob ID from Sui is stored as a little-endian 256-bit integer. Walrus expects a
 * big-endian byte ordering before base64 encoding, so we convert to bytes and then reverse.
 */
function convertDecimalBlobIdToBase64(decimalBlobId: string): string {
    try {
        // Parse as BigInt and convert to hex (little-endian integer)
        const bigIntValue = BigInt(decimalBlobId);
        let hexString = bigIntValue.toString(16);
        
        // Pad hex string to 64 characters (32 bytes * 2 hex chars per byte)
        hexString = hexString.padStart(64, '0');
        
        // Convert hex string to bytes (big-endian order coming out of hex)
        const bytes = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
            bytes[i] = parseInt(hexString.substring(i * 2, i * 2 + 2), 16);
        }
        
        // Sui stores the blob id as little-endian. Reverse to get big-endian before encoding.
        const reversedBytes = Uint8Array.from(bytes.reverse());
        
        // Convert bytes to base64
        let binary = '';
        for (let i = 0; i < reversedBytes.length; i++) {
            binary += String.fromCharCode(reversedBytes[i]);
        }
        const base64 = btoa(binary);
        
        // Convert to URL-safe base64 and remove padding (rstrip '=')
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (error) {
        console.error('Error converting blob ID:', error);
        throw new Error(`Failed to convert blob ID: ${error}`);
    }
}

interface BlobStorage {
    end_epoch: number;
    id: string;
    start_epoch: number;
    storage_size: string;
}

interface BlobContentsJson {
    blob_id: string;
    certified_epoch: number;
    deletable: boolean;
    encoding_type: number;
    id: string;
    registered_epoch: number;
    size: string;
    storage: BlobStorage;
}

interface BlobObjectNode {
    asMoveObject: {
        address: string;
        contents: {
            json: BlobContentsJson;
        } | null;
    } | null;
}

interface GraphQLObjectsResponse {
    objects: {
        nodes: BlobObjectNode[];
    };
}

export interface BlobObject {
    address: string;
    blobId: string;
    deletable: boolean;
    size: string;
    registeredEpoch: number;
}

export async function getAllBlobObjects(ownerAddress?: string): Promise<BlobObject[]> {
    const targetOwner = ownerAddress || OWNER;
    const query = `
    query {
        objects (filter: { type: "0xd84704c17fc870b8764832c535aa6b11f21a95cd6f5bb38a9b07d2cf42220c66::blob::Blob", owner: "${targetOwner}"}) {
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
    console.log('Executing GraphQL query for owner:', OWNER);
    const result = await graphqlClient.query<GraphQLObjectsResponse>({
        query: query,
        variables: {}
    });
    
    console.log('GraphQL result:', result);
    
    if (result.errors) {
        console.error('GraphQL errors:', result.errors);
        throw new Error(`GraphQL errors: ${result.errors.map(e => e.message).join(', ')}`);
    }
    
    const nodes = result.data?.objects?.nodes || [];
    console.log('GraphQL nodes:', nodes);
    
    const blobObjects = nodes
        .filter(node => node.asMoveObject !== null && node.asMoveObject.contents !== null)
        .map(node => {
            const moveObject = node.asMoveObject!;
            const json = moveObject.contents!.json;
            const walrusBlobId = convertDecimalBlobIdToBase64(json.blob_id);
            const deletableRaw = json.deletable as unknown;
            let isDeletable = false;
            if (typeof deletableRaw === 'boolean') {
                isDeletable = deletableRaw;
            } else if (typeof deletableRaw === 'string') {
                isDeletable = deletableRaw === 'true' || deletableRaw === '1';
            } else if (typeof deletableRaw === 'number') {
                isDeletable = deletableRaw === 1;
            }
            return {
                address: moveObject.address,
                blobId: walrusBlobId,
                deletable: isDeletable,
                size: json.size,
                registeredEpoch: json.registered_epoch
            };
        });
    
    console.log('Processed blob objects:', blobObjects);
    return blobObjects;
}