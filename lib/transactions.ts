import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { getFullnodeUrl, type SuiTransactionBlockResponse } from "@mysten/sui/client";

const OWNER = process.env.ADMIN_ADDRESS || '';
const OWNER_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY || '';

let OWNER_KEYPAIR: Ed25519Keypair;
try {
    if (OWNER_PRIVATE_KEY) {
        OWNER_KEYPAIR = Ed25519Keypair.fromSecretKey(OWNER_PRIVATE_KEY);
    } else {
        // Fallback for build time or when env var is missing - though it should be present at runtime
        console.warn("ADMIN_PRIVATE_KEY is missing in environment variables.");
        // We can't really function without it for owner transactions, but we avoid crashing at import time
        OWNER_KEYPAIR = Ed25519Keypair.generate(); 
    }
} catch (e) {
    console.error("Failed to create keypair from ADMIN_PRIVATE_KEY", e);
    OWNER_KEYPAIR = Ed25519Keypair.generate();
}

export const client = new SuiJsonRpcClient({
    url: getFullnodeUrl('testnet'),
    network: 'testnet',
});


export async function executeOwnerTransaction(
    transaction: Transaction
): Promise<SuiTransactionBlockResponse> {
    if (!OWNER_PRIVATE_KEY) {
        throw new Error("ADMIN_PRIVATE_KEY is not configured.");
    }

    transaction.setSender(OWNER);
    
    const { bytes, signature } = await transaction.sign({ client, signer: OWNER_KEYPAIR});
    return await client.executeTransactionBlock({
        transactionBlock: bytes,
        signature: signature,
        options: { showEffects: true, showEvents: true }
    });   
}
