import { DefaultEndpointTimeout } from './config';

/**
 * This module contains methods required to contact an external endpoint.
 */

export type Parameters = {
    body?: string;
    headers?: Record<string, string>;
    method?: string;
    timeout?: number;
};

export type GenericResponse = {
    headers: Record<string, string>;
    status: number;
    statusText: string;
    data?: number[];
};

export async function fetchUrl(
    pinnedFetch: typeof globalThis.fetch,
    endpoint: string,
    params?: Parameters,
): Promise<GenericResponse> {
    const url = new URL(endpoint);
    const body = params?.body;
    const method = normalizeMethod(params?.method);
    const headers = normalizeHeaders(url, params?.headers, body);
    const timeout = params?.timeout ?? DefaultEndpointTimeout;
    return pinnedFetch(url, { headers, method, body, signal: AbortSignal.timeout(timeout) }).then(
        async (res) => {
            const status = res.status;
            const statusText = res.statusText;
            const headers = convertRespHeaders(res.headers);
            if (res.body) {
                const dataBuf: ArrayBuffer = await res.arrayBuffer();
                const data = Array.from(new Uint8Array(dataBuf));
                return { status, statusText, headers, data };
            }
            return { status, statusText, headers };
        },
    );
}

function convertRespHeaders(headers: Headers): Record<string, string> {
    const hs: Record<string, string> = {};
    for (const [k, v] of headers.entries()) {
        hs[k] = v;
    }
    return hs;
}

function normalizeHeaders(
    url: URL,
    headers?: Record<string, string>,
    body?: string,
): Record<string, string> | undefined {
    if (!headers) {
        return headers;
    }
    const headerMap = mergeHeaders(headers);

    /// fix host header
    if (headerMap.has('host')) {
        headerMap.set('host', ['Host', url.host]);
    }

    // fix content length
    if (headerMap.has('content-length')) {
        const size = body?.length ?? 0;
        headerMap.set('content-length', ['Content-Length', `${size}`]);
    }

    return Array.from(headerMap.values()).reduce<Record<string, string>>((acc, [key, value]) => {
        acc[key] = value;
        return acc;
    }, {});
}

function normalizeMethod(method?: string) {
    const m = method?.toUpperCase().trim();
    if (m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') {
        return m;
    }
    return 'GET';
}

/**
 * merge headers into this map:
 * <key, ["headerKey", "headerValue1, headerValue2, ..."]>
 * key - lowercase key to easily and uniformly reference header
 * headerKey - preferably uppercase starting header key
 * headerValue - merged values of all header key entries
 *
 */
function mergeHeaders(headers: Record<string, string>): Map<string, [string, string]> {
    return Object.entries(headers).reduce<Map<string, [string, string]>>((acc, [key, value]) => {
        const mapKey = key.trim().toLowerCase();
        if (mapKey.length === 0) {
            return acc;
        }

        if (!acc.has(mapKey)) {
            acc.set(mapKey, [key, value]);
            return acc;
        }

        const [existKey, existVal] = acc.get(mapKey) as [string, string];
        if (existVal.includes(value)) {
            return acc;
        }

        const newValue = `${existVal}, ${value}`;
        // prefer uppercase starting key
        const newKey = existKey.charAt(0) === existKey.charAt(0).toUpperCase() ? existKey : key;
        acc.set(mapKey, [newKey, newValue]);
        return acc;
    }, new Map());
}
