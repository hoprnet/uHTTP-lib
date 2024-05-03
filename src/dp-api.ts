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
    clientId: string;
    forceZeroHop: boolean;
};

export type NodeOps = {
    discoveryPlatformEndpoint: string;
    nodeAccessToken: string;
    timeout?: number;
};

export type Nodes = {
    entryNodes: EntryNode[];
    exitNodes: ExitNode[];
    matchedAt: string;
    versions: Versions;
};

export type QuotaParams = {
    clientId: string;
    rpcMethod?: string;
    segmentCount: number;
    lastSegmentLength?: number;
    chainId?: string;
    type: 'request' | 'response';
};

export type Versions = {
    phttpLib: string;
};

export function getNodes(ops: ClientOps, amount: number, since: Date): Promise<Nodes> {
    const url = new URL('/api/v1/nodes/pairings', ops.discoveryPlatformEndpoint);
    url.searchParams.set('amount', `${amount}`);
    url.searchParams.set('since', since.toISOString());
    url.searchParams.set('force_zero_hop', `${ops.forceZeroHop}`);
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-rpch-client': ops.clientId,
    };

    return fetch(url, { headers, signal: AbortSignal.timeout(DefaultDpTimeout) }).then((res) => {
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
    { clientId, segmentCount, rpcMethod, type, lastSegmentLength, chainId }: QuotaParams,
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
    });
    return new Promise((pRes, pRej) => {
        fetch(url, { headers, method: 'POST', body, signal: AbortSignal.timeout(DefaultDpTimeout) })
            .then((res) => {
                if (res.status === 204) {
                    return pRes();
                }
                return pRej(`Unexpected response code: ${res.status}`);
            })
            .catch((err) => pRej(err));
    });
}
