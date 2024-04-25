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
    const headers = params?.headers;
    const body = params?.body;
    const method = sanitizeMethod(params?.method);
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

function sanitizeMethod(method?: string) {
    const m = method?.toUpperCase().trim();
    if (m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') {
        return m;
    }
    return 'GET';
}
