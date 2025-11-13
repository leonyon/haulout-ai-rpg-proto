import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { getFullnodeUrl } from "@mysten/sui/client";

const OWNER = '0x8fe1368e8c8fad5d45f2470a4b05d66cdf08288872e4ba0654ffb8de123c0856';

const OWNER_KEYPAIR : Ed25519Keypair = Ed25519Keypair.fromSecretKey('suiprivkey1qp4dm5p4hcdsxzvcjhhngtm53rg3hpmm03ay0h3w39lynxe200quszem5cf');

const client = new SuiJsonRpcClient({
    url: getFullnodeUrl('testnet'),
    network: 'testnet',
});


export async function executeOwnerTransaction(
    transaction: Transaction
): Promise<{ digest: string }> {
    const { bytes, signature } = await transaction.sign({ client, signer: OWNER_KEYPAIR});
    return await client.executeTransactionBlock({ transactionBlock: bytes, signature: signature, options: { showEffects: true } });   
}
