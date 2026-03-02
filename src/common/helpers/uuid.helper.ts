import { uuidv7 } from 'uuidv7';

/**
 * Generate a UUID v7 and return as Uint8Array<ArrayBuffer> (16 bytes).
 * Compatible with Prisma v7 Bytes fields.
 */
export function generateUuidV7(): Uint8Array<ArrayBuffer> {
    const uuid = uuidv7();
    return uuidToBytes(uuid);
}

/**
 * Convert a UUID string (with dashes) to Uint8Array<ArrayBuffer> (16 bytes).
 * Explicitly uses `new ArrayBuffer(16)` to guarantee strict ArrayBuffer typing
 * required by Prisma v7 + TypeScript 5.9.
 */
export function uuidToBytes(uuid: string): Uint8Array<ArrayBuffer> {
    const hex = uuid.replace(/-/g, '');
    const ab = new ArrayBuffer(16);
    const bytes = new Uint8Array(ab);
    for (let i = 0; i < 16; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes as Uint8Array<ArrayBuffer>;
}

// Alias used across codebase
export const uuidToBuffer = uuidToBytes;

/**
 * Convert a Prisma v7 Bytes field (Uint8Array) back to a UUID string.
 * Handles both ArrayBuffer and ArrayBufferLike (e.g. Buffer) backing.
 */
export function bufferToUuid(input: Uint8Array | Buffer): string {
    let hex = '';
    const len = input.byteLength;
    for (let i = 0; i < len; i++) {
        hex += input[i].toString(16).padStart(2, '0');
    }
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20),
    ].join('-');
}
