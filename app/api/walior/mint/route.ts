import { NextResponse } from 'next/server';
import { mintWalior, uploadWaliorIdentity } from '@/lib/walior';

// Simple in-memory lock mechanism
const processingAddresses = new Set<string>();

export async function POST(request: Request) {
    let receiver = '';

    try {
        const body = await request.json().catch(() => ({}));
        receiver = typeof body?.receiver === 'string' ? body.receiver.trim() : '';
        
        if (!receiver) {
            return NextResponse.json({ error: 'receiver address is required.' }, { status: 400 });
        }

        if (processingAddresses.has(receiver)) {
            return NextResponse.json({ error: 'A mint request is already in progress for this address.' }, { status: 429 });
        }

        processingAddresses.add(receiver);

        const encoder = new TextEncoder();
        
        const stream = new ReadableStream({
            async start(controller) {
                // Helper to send updates
                const sendUpdate = (data: any) => {
                    try {
                        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
                    } catch (e) {
                        // Controller might be closed
                    }
                };

                try {
                    let identityBlobId = typeof body?.identityBlobId === 'string' ? body.identityBlobId.trim() : '';
                    let waliorName = typeof body?.name === 'string' ? body.name.trim() : '';

                    if (!identityBlobId && body?.createIdentity) {
                        sendUpdate({ status: 'generating', message: 'Generating WALior identity and uploading to Walrus...' });
                        
                        const generated = await uploadWaliorIdentity({
                            seedName: waliorName || undefined,
                        });
                        identityBlobId = generated.blobId;
                        if (!waliorName) {
                            waliorName = generated.identity.name;
                        }
                    }

                    if (!identityBlobId) {
                        throw new Error('identityBlobId is required.');
                    }

                    sendUpdate({ status: 'minting', message: `Minting WALior "${waliorName}" on Sui...` });

                    const result = await mintWalior({
                        identityBlobId,
                        receiver,
                        name: waliorName,
                    });

                    sendUpdate({ 
                        status: 'complete', 
                        data: {
                            ...result,
                            identityBlobId,
                            name: waliorName,
                        }
                    });
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : 'Failed to mint WALior.';
                    sendUpdate({ status: 'error', message });
                } finally {
                    processingAddresses.delete(receiver);
                    controller.close();
                }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'application/json',
                'Transfer-Encoding': 'chunked',
            },
        });

    } catch (error: unknown) {
        if (receiver) processingAddresses.delete(receiver);
        const message = error instanceof Error ? error.message : 'Failed to mint WALior.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
