export type Parameters = {
    body?: string;
    headers?: Record<string, string>;
    method?: string;
};

export type Response = {
    status: number;
    text: string;
    headers: Record<string, string>;
};

export async function fetchUrl(endpoint: string, params?: Parameters): Promise<Response> {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint);
        const headers = determineHeaders(params?.headers);
        const body = params?.body;
        const method = determineMethod(params?.method);
        return fetch(url, { headers, method, body, signal: AbortSignal.timeout(30000) })
            .then(async (res) => {
                const status = res.status;
                const headers = convertRespHeaders(res.headers);
                const text = await res.text();
                return resolve({ status, text, headers });
            })
            .catch(reject);
    });
}

function determineHeaders(headers?: Record<string, string>) {
    if (headers) {
        return headers;
    }

    return {
        'Content-Type': 'application/json',
    };
}

function convertRespHeaders(headers: Headers): Record<string, string> {
    const hs: Record<string, string> = {};
    for (const [k, v] of headers.entries()) {
        hs[k] = v;
    }
    return hs;
}

function determineMethod(method?: string) {
    const m = method?.toUpperCase().trim();
    if (m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') {
        return m;
    }
    return 'GET';
}
