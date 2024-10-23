// Maximum bytes we can shuffle at once through the websocket connection - FRAME_SIZE
const MaxBytes = 3562;

export type Frame = number;

const ProtocolVersion = 0x01;
const SizeBytesLen = 4;

/**
 * Slice data into frames.
 */
export function toFrames(data: Uint8Array): Frame[] {
    const bytelen = data.length;
 
    ut
    
    const 
    const base64Str = Utils.bytesToBase64(data);
    const totalCount = Math.ceil(base64Str.length / MaxBytes);

    const segments = [];
    for (let i = 0; i < totalCount; i++) {
        const body = base64Str.slice(i * MaxBytes, (i + 1) * MaxBytes);
        segments.push({
            requestId,
            nr: i,
            totalCount,
            body,
        });
    }
    return segments;
}

