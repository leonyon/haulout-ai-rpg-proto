import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { createBasicWalrusClient, writeWalrusBlob, OWNER_KEYPAIR } from '@/lib/walrus';

const AVATARS_DIR = path.join(process.cwd(), 'avatars');
const WALIORS_DIR = path.join(AVATARS_DIR, 'waliors');
const BACKGROUNDS_DIR = path.join(AVATARS_DIR, 'backgrounds');

export async function generateAndUploadWaliorImage(): Promise<string> {
    // 1. Get list of files
    const [waliorFiles, bgFiles] = await Promise.all([
        fs.readdir(WALIORS_DIR),
        fs.readdir(BACKGROUNDS_DIR)
    ]);

    const pngWaliors = waliorFiles.filter(f => f.endsWith('.png'));
    const pngBackgrounds = bgFiles.filter(f => f.endsWith('.png'));

    if (pngWaliors.length === 0 || pngBackgrounds.length === 0) {
        throw new Error('Missing avatar assets in avatars/ directory.');
    }

    // 2. Pick random
    const randomWalior = pngWaliors[Math.floor(Math.random() * pngWaliors.length)];
    const randomBg = pngBackgrounds[Math.floor(Math.random() * pngBackgrounds.length)];

    const waliorPath = path.join(WALIORS_DIR, randomWalior);
    const bgPath = path.join(BACKGROUNDS_DIR, randomBg);

    console.log(`[Image Gen] Compositing ${randomWalior} on ${randomBg}...`);

    // 3. Composite
    // Assuming images are compatible sizes. Sharp handles this well.
    // We load the background, and composite the walior on top (centered by default or just 0,0 if same size)
    // Since they are pixel art likely, we might want to resize? 
    // Assuming the assets are prepared to be composited directly (same dimensions).
    
    const compositeBuffer = await sharp(bgPath)
        .composite([{ input: waliorPath }])
        .png()
        .toBuffer();

    // 4. Upload to Walrus
    const client = createBasicWalrusClient();
    // Images are usually static assets, maybe don't need deletion? 
    // But let's make them deletable to be safe and consistent with cleanup policies if needed later.
    // Though images for NFTs usually should stick around. Let's keep deletable=false for now unless requested otherwise.
    // Actually, the user requested "do what we did before... generate and upload identity". 
    // Identity is metadata. Image is asset. Let's make it permanent (deletable: false) by default for NFTs.
    // But wait, if we want to clean up junk during testing, maybe true?
    // I'll stick to false (permanent) for the image as it is the visual representation of the NFT.
    
    const { blobId } = await writeWalrusBlob(
        client,
        new Uint8Array(compositeBuffer),
        3, // 3 epochs
        false, // Not deletable (permanent-ish)
        OWNER_KEYPAIR
    );

    console.log(`[Image Gen] Image uploaded to Walrus. Blob ID: ${blobId}`);
    return blobId;
}

