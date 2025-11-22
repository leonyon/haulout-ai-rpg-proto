import { NextResponse } from 'next/server';
import { fetchWaliorObjects } from '@/lib/walior';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const owner = searchParams.get('owner');
        if (!owner || owner.trim().length === 0) {
            return NextResponse.json({ error: 'owner query parameter is required.' }, { status: 400 });
        }

        const packageId = process.env.WALIOR_PACKAGE_ID;
        if (!packageId) {
            return NextResponse.json({ error: 'WALIOR_PACKAGE_ID is not configured.' }, { status: 500 });
        }

        const waliors = await fetchWaliorObjects(owner, packageId);
        return NextResponse.json(waliors);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to list WALiors.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
