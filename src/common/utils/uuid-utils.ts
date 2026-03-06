export function bufferToUuid(input: Uint8Array | Buffer): string {
    const buffer = Buffer.from(input);
    return [
        buffer.toString('hex', 0, 4),
        buffer.toString('hex', 4, 6),
        buffer.toString('hex', 6, 8),
        buffer.toString('hex', 8, 10),
        buffer.toString('hex', 10, 16)
    ].join('-');
}

export function uuidToBuffer(uuid: string): Buffer {
    return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}
