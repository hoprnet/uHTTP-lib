import { DefaultDpTimeout } from './config';

import type { EntryNode } from './entry-node';
import type { ExitNode } from './exit-node';

export const NoMoreNodes = 'no more nodes';
export const Unauthorized = 'unauthorized';

/**
 * This module contains all communication with the discovery platform.
 */

export type ClientOps = {
    discoveryPlatformEndpoint: string;
    pinnedFetch: typeof globalThis.fetch;
    clientId: string;
    forceZeroHop: boolean;
    clientAssociated: boolean;
};

export type NodeOps = {
    discoveryPlatformEndpoint: string;
    pinnedFetch: typeof globalThis.fetch;
    nodeAccessToken: string;
    timeout?: number;
};

export type Nodes = {
    entryNodes: EntryNode[];
    exitNodes: ExitNode[];
    matchedAt: string;
};

export type QuotaParams = {
    clientId: string;
    rpcMethod?: string;
    segmentCount: number;
    lastSegmentLength?: number;
    chainId?: string;
    domain?: string;
    type: 'request' | 'response';
};

export function getNodes(ops: ClientOps, amount: number): Promise<Nodes> {
    const url = new URL('/api/v1/nodes/pairings', ops.discoveryPlatformEndpoint);
    url.searchParams.set('amount', `${amount}`);
    url.searchParams.set('force_zero_hop', `${ops.forceZeroHop}`);
    if (ops.clientAssociated !== undefined) {
        url.searchParams.set('client_associated', `${ops.clientAssociated}`);
    }
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-rpch-client': ops.clientId,
    };

    return ops
        .pinnedFetch(url, { headers, signal: AbortSignal.timeout(DefaultDpTimeout) })
        .then((res) => {
            switch (res.status) {
                case 204: // none found
                    throw new Error(NoMoreNodes);
                case 403: // unauthorized
                    throw new Error(Unauthorized);
                default:
                    return res.json();
            }
        });
}

export function postQuota(
    ops: NodeOps,
    { clientId, domain, segmentCount, rpcMethod, type, lastSegmentLength, chainId }: QuotaParams,
): Promise<void> {
    const url = new URL(`/api/v1/quota/${type}`, ops.discoveryPlatformEndpoint);
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-rpch-node': ops.nodeAccessToken,
    };
    const body = JSON.stringify({
        clientId,
        segmentCount,
        rpcMethod,
        lastSegmentLength,
        chainId,
        domain,
    });
    return new Promise((pRes, pRej) => {
        ops.pinnedFetch(url, {
            headers,
            method: 'POST',
            body,
            signal: AbortSignal.timeout(DefaultDpTimeout),
        })
            .then((res) => {
                if (res.status === 204) {
                    return pRes();
                }
                return pRej(`Unexpected response code: ${res.status}`);
            })
            .catch((err) => pRej(err));
    });
}
