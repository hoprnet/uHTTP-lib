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

export type Response = {
    headers: Record<string, string>;
    status: number;
    statusText: string;
    text: string;
};

export async function fetchUrl(endpoint: string, params?: Parameters): Promise<Response> {
    const url = new URL(endpoint);
    const body = params?.body;
    const method = normalizeMethod(params?.method);
    const headers = normalizeHeaders(url, params?.headers, body);
    const timeout = params?.timeout ?? DefaultEndpointTimeout;
    return fetch(url, { headers, method, body, signal: AbortSignal.timeout(timeout) }).then(
        async (res) => {
            const status = res.status;
            const statusText = res.statusText;
            const headers = convertRespHeaders(res.headers);
            const text = await res.text();
            return { status, statusText, text, headers };
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
    const res = {
        ...headers,
    };
    const keys = new Set(Object.keys(headers).map((k) => k.trim().toLowerCase()));
    if (keys.has('host')) {
        res.host = url.href;
    }
    if (keys.has('content-length')) {
        const s = body?.length ?? 0;
        res['content-length'] = `${s}`;
    }

    return res;
}

function normalizeMethod(method?: string) {
    const m = method?.toUpperCase().trim();
    if (m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') {
        return m;
    }
    return 'GET';
}
