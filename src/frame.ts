import * as Res from './result';
import * as Utils from './utils';

// Maximum bytes we can shuffle at once through the websocket connection.
// Anything bigger get silently lost.
const MaxBytes = 3632;

export type Frame = Uint8Array;

///
// Simple byte protocol:
//
// 1st byte - version
// 2nd to 5th byte - total length
// 6th to last byte - data (length long)
const ProtocolVersion = 0x01;
const SizeBytesLen = 4;

/**
 * Slice data into frames.
 */
export function toFrames(data: Uint8Array): Res.Result<Frame[]> {
    const bytelen = data.length;
    const countBytes = Utils.integerToBytes(bytelen);
    if (countBytes.length > SizeBytesLen) {
        return Res.err(`request exceeds max size of ${Math.pow(256, SizeBytesLen)} bytes`);
    }

    const protocolData = Utils.concatBytes(new Uint8Array([ProtocolVersion]), countBytes);
    const allData = Utils.concatBytes(protocolData, data);

    const totalLength = allData.length;
    const frames: Uint8Array[] = [];
    for (let i = 0; i < totalLength; i++) {
        const bytes = allData.slice(i * MaxBytes, (i + 1) * MaxBytes);
        frames.push(bytes);
    }
    return Res.ok(frames);
}
