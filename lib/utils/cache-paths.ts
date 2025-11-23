import path from 'node:path';
import { promises as fs } from 'node:fs';

const CACHE_ROOT = process.env.VERCEL ? '/tmp/haulout-cache' : path.join(process.cwd(), '.cache');

export function getCacheRoot(): string {
    return CACHE_ROOT;
}

export function buildCachePath(...segments: string[]): string {
    return path.join(CACHE_ROOT, ...segments);
}

export async function ensureCacheDir(...segments: string[]): Promise<string> {
    const dir = buildCachePath(...segments);
    await fs.mkdir(dir, { recursive: true });
    return dir;
}

export async function ensureCacheFilePath(...segments: string[]): Promise<string> {
    const target = buildCachePath(...segments);
    await fs.mkdir(path.dirname(target), { recursive: true });
    return target;
}

