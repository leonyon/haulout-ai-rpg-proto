import { NextResponse } from 'next/server';
import { uploadWaliorIdentity } from '@/lib/walior';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(function handle() {
            return {};
        });

        const options = {
            seedName: typeof body?.name === 'string' ? body.name : undefined,
            archetype: typeof body?.archetype === 'string' ? body.archetype : undefined,
        };

        const result = await uploadWaliorIdentity(options);
        return NextResponse.json(result);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to create WALior identity.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}



