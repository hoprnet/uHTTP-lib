import * as Res from './result';
import * as Utils from './utils';

// Maximum bytes we can shuffle at once through the websocket connection.
// Anything bigger get silently lost.
const MaxBytes = 3632;

export type Frame = Uint8Array;

export type RequestWrapper = {
    length: number;
    data: Uint8Array;
    entryId: string;
    requestId: string;
};

export type ResponseWrapper = {
    length: number;
    data: Uint8Array;
};

///
// Simple byte protocol:
//
// Request:
//
// idx 0 : version
// idx 1 - 5 (4 bytes) : total length
// idx 5 - 57 (52 bytes) : entry peerId
// idx 58 - 90 (32 bytes) : request UUID
// idx 90 - end : data
//
// Response
//
// idx 0 : version
// idx 1 - 5 (4 bytes) : total length
// idx 5 - end : data
///
const ProtocolVersion = 0x01;
const SizeBytesLen = 4;

/**
 * Slice data into frames using Request protocol.
 */
export function toRequestFrames(
    entryId: string,
    requestId: string,
    data: Uint8Array,
): Res.Result<Frame[]> {
    const bytelen = data.length;
    const countBytes = Utils.integerToBytes(bytelen);
    if (countBytes.length > SizeBytesLen) {
        return Res.err(`request exceeds max size of ${Math.pow(256, SizeBytesLen)} bytes`);
    }

    const pData1 = Utils.concatBytes(new Uint8Array([ProtocolVersion]), countBytes);
    const eIdBytes = Utils.stringToBytes(entryId);
    const pData2 = Utils.concatBytes(pData1, eIdBytes);
    const reqIdBytes = Utils.stringToBytes(requestId);
    const pData3 = Utils.concatBytes(pData2, reqIdBytes);
    const allData = Utils.concatBytes(pData3, data);

    const totalLength = allData.length;
    const frames: Uint8Array[] = [];
    for (let i = 0; i < totalLength; i++) {
        const bytes = allData.slice(i * MaxBytes, (i + 1) * MaxBytes);
        frames.push(bytes);
    }
    return Res.ok(frames);
}

/**
 * Slice data into frames using Response protocol.
 */
export function toResponseFrames(data: Uint8Array): Res.Result<Frame[]> {
    const bytelen = data.length;
    const countBytes = Utils.integerToBytes(bytelen);
    if (countBytes.length > SizeBytesLen) {
        return Res.err(`response exceeds max size of ${Math.pow(256, SizeBytesLen)} bytes`);
    }

    const pData1 = Utils.concatBytes(new Uint8Array([ProtocolVersion]), countBytes);
    const allData = Utils.concatBytes(pData1, data);

    const totalLength = allData.length;
    const frames: Uint8Array[] = [];
    for (let i = 0; i < totalLength; i++) {
        const bytes = allData.slice(i * MaxBytes, (i + 1) * MaxBytes);
        frames.push(bytes);
    }
    return Res.ok(frames);
}

export function toRequestFrameWrapper(data: Frame): Res.Result<RequestWrapper> {
    if (data.length < 58) {
        return Res.err(`too short for a first request frame: only ${data.length} bytes`);
    }
    const version = data[0];
    if (version !== ProtocolVersion) {
        return Res.err(`unsupported protocol version: ${version}`);
    }

    const length = Utils.bytesToInteger(data.slice(1, 5));
    const entryId = Utils.bytesToString(data.slice(5, 57));
    const requestId = Utils.bytesToString(data.slice(57, 89));
    return Res.ok({
        length,
        entryId,
        data: data.slice(58),
        requestId,
    });
}

export function toResponseFrameWrapper(data: Frame): Res.Result<ResponseWrapper> {
    if (data.length < 5) {
        return Res.err(`too short for a first response frame: only ${data.length} bytes`);
    }
    const version = data[0];
    if (version !== ProtocolVersion) {
        return Res.err(`unsupported protocol version: ${version}`);
    }

    const length = Utils.bytesToInteger(data.slice(1, 5));
    return Res.ok({
        length,
        data: data.slice(5),
    });
}

export function isComplete({ length, data }: { data: Uint8Array; length: number }): boolean {
    return length === data.length;
}

export function concatData(f: { data: Uint8Array }, data: Uint8Array) {
    f.data = Utils.concatBytes(f.data, data);
}
