import * as Res from './result';

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export enum VrsnCmp {
    Identical,
    PatchMismatch,
    MinorMismatch,
    MajorMismatch,
}

export function shortPeerId(peerId: string): string {
    return `.${peerId.substring(peerId.length - 4)}`;
}

export function randomEl<T>(arr: T[]): T {
    return arr[randomIdx(arr)];
}

/**
 * Returns random index for an array of weights.
 */
export function randomWeightedIdx(weights: number[]): number {
    const total = weights.reduce((acc, w) => acc + w, 0);
    const rand = Math.random() * total;

    let cumWeight = 0;
    for (let i = 0; i < weights.length; i++) {
        cumWeight += weights[i];
        if (cumWeight > rand) {
            return i;
        }
    }

    return weights.length - 1;
}

export function randomIdx<T>(arr: T[]): number {
    return Math.floor(Math.random() * arr.length);
}

export function average(arr: number[]): number {
    const sum = arr.reduce((acc, l) => acc + l, 0);
    return sum / arr.length || 0;
}

export function isValidURL(url: string) {
    if ('canParse' in URL) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return URL.canParse(url);
    }
    try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        new URL(url);
        return true;
    } catch (_ex) {
        return false;
    }
}

export function stringToBytes(str: string): Uint8Array {
    return textEncoder.encode(str);
}

export function bytesToBase64(bytes: Uint8Array): string {
    // see https://developer.mozilla.org/en-US/docs/Glossary/Base64#the_unicode_problem
    const strBytes = Array.from(bytes, (b) => String.fromCodePoint(b));
    return btoa(strBytes.join(''));
}

export function base64ToBytes(base64: string): Res.Result<Uint8Array> {
    try {
        const binStr = atob(base64);
        const arr = Uint8Array.from(binStr, (b) => b.codePointAt(0) as number);
        return Res.ok(arr);
    } catch (err: any) {
        // DOMException InvalidCharacterError
        return Res.err(err.toString());
    }
}

export function bytesToString(bytes: Uint8Array): string {
    return textDecoder.decode(bytes);
}

export function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
    const res = new Uint8Array(left.length + right.length);
    res.set(left);
    res.set(right, left.length);
    return res;
}

/**
 * Convert **Headers** to **Record<string, string> for easier usage.
 */
export function headersToRecord(headers: Headers | Record<string, string>): Record<string, string> {
    return Object.entries(headers).reduce<Record<string, string>>((acc, [k, v]) => {
        if (v) {
            if (Array.isArray(v)) {
                acc[k] = v.join(', ');
            } else {
                acc[k] = v;
            }
        }
        return acc;
    }, {});
}

export function hexStringToBytes(hexString: string) {
    // Remove the '0x' prefix if it exists
    hexString = hexString.startsWith('0x') ? hexString.slice(2) : hexString;

    // Check if the hex string has an odd length, and pad with a leading zero if needed
    if (hexString.length % 2 !== 0) {
        hexString = '0' + hexString;
    }

    // Create a Uint8Array by iterating through the hex string
    const uint8Array = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
        uint8Array[i / 2] = parseInt(hexString.substr(i, 2), 16);
    }

    return uint8Array;
}

export function versionCompare(ref: string, version: string): Res.Result<VrsnCmp> {
    const r = ref.split('.');
    if (r.length < 3) {
        return Res.err('invalid ref');
    }
    const v = version.split('.');
    if (v.length < 3) {
        return Res.err('invalid version');
    }
    const [rMj, rMn, rP] = r;
    const [vMj, vMn, vP] = v;
    if (parseInt(rMj, 10) !== parseInt(vMj, 10)) {
        return Res.ok(VrsnCmp.MajorMismatch);
    }
    if (parseInt(rMn, 10) !== parseInt(vMn, 10)) {
        return Res.ok(VrsnCmp.MinorMismatch);
    }
    if (parseInt(rP, 10) !== parseInt(vP, 10)) {
        return Res.ok(VrsnCmp.PatchMismatch);
    }
    return Res.ok(VrsnCmp.Identical);
}
