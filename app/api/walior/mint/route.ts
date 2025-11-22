import { NextResponse } from 'next/server';
import { mintWalior, uploadWaliorIdentity, generateAndUploadWaliorImage } from '@/lib/walior';

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
                    let imageBlobId = '';

                    // 1. Generate Identity if needed
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

                    // Wait a bit to avoid object locking issues if we just did a transaction (Walrus upload)
                    if (body?.createIdentity) {
                         sendUpdate({ status: 'waiting', message: 'Waiting for previous transaction to settle...' });
                         await new Promise(resolve => setTimeout(resolve, 2000));
                    }

                    // 2. Generate Image
                    sendUpdate({ status: 'generating_image', message: 'Compositing unique WALior avatar and uploading...' });
                    try {
                        imageBlobId = await generateAndUploadWaliorImage();
                    } catch (imgError) {
                        console.error('Failed to generate image:', imgError);
                        throw new Error('Failed to generate avatar image.');
                    }

                    // 3. Mint on Chain
                    sendUpdate({ status: 'waiting_mint', message: 'Preparing to mint...' });
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    sendUpdate({ status: 'minting', message: `Minting WALior "${waliorName}" on Sui...` });

                    const result = await mintWalior({
                        identityBlobId,
                        imageBlobId,
                        receiver,
                        name: waliorName,
                    });

                    sendUpdate({ 
                        status: 'complete', 
                        data: {
                            ...result,
                            identityBlobId,
                            imageBlobId,
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
