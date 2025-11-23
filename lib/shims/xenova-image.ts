/**
 * Lightweight stub for the Transformers.js `RawImage` helper.
 *
 * The current deployment only uses text pipelines (embeddings, LLM prompts),
 * so image helpers are never executed. We still provide a class definition so
 * that static imports succeed without bundling native `sharp`.
 */
export class RawImage {
    constructor() {
        throw new Error('RawImage is not supported in this deployment.');
    }

    static async read(): Promise<never> {
        throw new Error('RawImage.read is not supported in this deployment.');
    }

    static async fromURL(): Promise<never> {
        throw new Error('RawImage.fromURL is not supported in this deployment.');
    }

    static async fromBlob(): Promise<never> {
        throw new Error('RawImage.fromBlob is not supported in this deployment.');
    }

    static fromTensor(): never {
        throw new Error('RawImage.fromTensor is not supported in this deployment.');
    }
}

