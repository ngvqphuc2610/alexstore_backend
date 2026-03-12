export function bufferToUuid(input: Uint8Array | Buffer): string {
    const buffer = Buffer.from(input);
    if (buffer.length === 0) return '00000000-0000-0000-0000-000000000000';
    if (buffer.length < 16) {
        const padded = Buffer.alloc(16, 0);
        buffer.copy(padded);
        return [
            padded.toString('hex', 0, 4),
            padded.toString('hex', 4, 6),
            padded.toString('hex', 6, 8),
            padded.toString('hex', 8, 10),
            padded.toString('hex', 10, 16)
        ].join('-');
    }
    return [
        buffer.toString('hex', 0, 4),
        buffer.toString('hex', 4, 6),
        buffer.toString('hex', 6, 8),
        buffer.toString('hex', 8, 10),
        buffer.toString('hex', 10, 16)
    ].join('-');
}

export function uuidToBuffer(uuid: string): Uint8Array {
    return new Uint8Array(Buffer.from(uuid.replace(/-/g, ''), 'hex'));
}
