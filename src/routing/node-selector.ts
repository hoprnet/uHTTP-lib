import { shortPeerId, randomEl, randomWeightedIdx } from '../utils';

import * as ExitData from './exit-data';
import * as NodeMatch from './node-match';
import * as NodePair from './node-pair';

import type { EntryNode } from '../entry-node';

const ExitNodesCompatVersions = ['3.'];

export enum Result {
    Success,
    NoNodes,
    NoNodesMatchingVersion,
}

export type Selection =
    | { result: Result.Success; match: NodeMatch.NodeMatch; via: string }
    | { result: Result.NoNodesMatchingVersion }
    | { result: Result.NoNodes };

// type EntryPerf = EntryData.Perf & { entryNode: EntryNode };
type ExitPerf = ExitData.Perf & NodeMatch.NodeMatch;

/**
 * Try to distribute evenly with best route pairs preferred.
 *
 */
export function routePair(
    nodePairs: Map<string, NodePair.NodePair>,
    forceManualRelaying: boolean,
): Selection {
    const routePerfs = createRoutePerfs(nodePairs, forceManualRelaying);
    return match(nodePairs, routePerfs);
}

/**
 * Try to distribute evenly with best route pairs preferred.
 * Exclude node match entry node from search.
 *
 */
export function fallbackRoutePair(
    nodePairs: Map<string, NodePair.NodePair>,
    exclude: EntryNode,
    forceManualRelaying: boolean,
): Selection {
    const routePerfs = createRoutePerfs(nodePairs, forceManualRelaying);
    const filtered = routePerfs.filter(({ entryNode }) => entryNode.id !== exclude.id);
    return match(nodePairs, filtered);
}

export function prettyPrint(sel: Selection) {
    switch (sel.result) {
        case Result.NoNodes:
            return 'no nodes';
        case Result.NoNodesMatchingVersion:
            return 'no nodes matching required version';
        case Result.Success: {
            const { entryNode, exitNode, reqRelayPeerId, respRelayPeerId } = sel.match;
            const eId = shortPeerId(entryNode.id);
            const xId = shortPeerId(exitNode.id);
            const path = [`e${eId}`];
            if (reqRelayPeerId) {
                path.push(`r${shortPeerId(reqRelayPeerId)}`);
            }
            path.push(`x${xId}`);
            if (respRelayPeerId) {
                path.push(`r${shortPeerId(respRelayPeerId)}`);
            }
            return `${path.join('>')} (via ${sel.via})`;
        }
    }
}

function match(nodePairs: Map<string, NodePair.NodePair>, routePerfs: ExitPerf[]): Selection {
    // special case no nodes
    if (routePerfs.length === 0) {
        return { result: Result.NoNodes };
    }
    // special case only one route
    if (routePerfs.length === 1) {
        return success(routePerfs[0], 'only route available');
    }

    // special case version mismatches
    const xVersionMatches = versionMatches(routePerfs);
    if (xVersionMatches.length === 1) {
        return success(xVersionMatches[0], 'only version match');
    }
    if (xVersionMatches.length === 0) {
        return { result: Result.NoNodesMatchingVersion };
    }

    ////
    // weight routes depending on failures and performance
    const routes = xVersionMatches;
    // 100 vs 0 points for info success vs fail
    const wNoInfoFails = routes.map(({ infoFail }) => (infoFail ? 0 : 100));
    // 100 points for virgin idle or 1 ongoing requests
    // 1 - 100 points for idle with only successes depending on successes
    // diff between successes and triple weighted failures added to single weighted ongoing
    const wRequestStats = routes.map(({ failures, ongoing, successes, total }) => {
        if (total === 0) {
            if (ongoing === 0) {
                return 100;
            }
            return 100 / ongoing;
        }
        if (failures === 0 && ongoing === 0) {
            return 100 - 99 / successes;
        }
        if (successes > failures * 3 + ongoing) {
            return successes - (failures * 3 + ongoing);
        }
        return 1;
    });
    const weights = wNoInfoFails.map((v, idx) => v + wRequestStats[idx]);
    const idx = randomWeightedIdx(weights);
    return success(routes[idx], `weighted random over performance[score ${weights[idx]}]`);
}

function success(
    { entryNode, exitNode, counterOffset, reqRelayPeerId, respRelayPeerId }: ExitPerf,
    via: string,
): Selection {
    return {
        result: Result.Success,
        match: { entryNode, exitNode, counterOffset, reqRelayPeerId, respRelayPeerId },
        via,
    };
}

function createRoutePerfs(nodePairs: Map<string, NodePair.NodePair>, forceManualRelaying: boolean) {
    return Array.from(nodePairs.values()).reduce<ExitPerf[]>((acc, np) => {
        const perfs = Array.from(np.exitDatas).map(([xId, xd]) => {
            const [reqRelayPeerId, respRelayPeerId] = determineRelays(
                np,
                xId,
                xd,
                forceManualRelaying,
            );
            return {
                ...ExitData.perf(xd),
                entryNode: np.entryNode,
                exitNode: np.exitNodes.get(xId)!,
                reqRelayPeerId,
                respRelayPeerId,
            };
        });
        if (forceManualRelaying) {
            const withRelays = perfs.filter(
                ({ reqRelayPeerId, respRelayPeerId }) => reqRelayPeerId && respRelayPeerId,
            );
            return acc.concat(withRelays);
        }
        return acc.concat(perfs);
    }, []);
}

function determineRelays(
    np: NodePair.NodePair,
    xId: string,
    xd: ExitData.ExitData,
    forceManualRelaying: boolean,
) {
    if (!forceManualRelaying) {
        return [];
    }
    if (!xd.relayShortIds) {
        return [];
    }
    const relayShortIds = xd.relayShortIds;
    const relays = np.relays.filter((rId) => rId !== xId && rId !== np.entryNode.id);
    const reqRelayPeerId = randomEl(relays);
    const respRelays = np.peers.filter(
        (pId) => pId !== xId && relayShortIds.find((shId) => pId.endsWith(shId)),
    );
    const respRelayPeerId = randomEl(respRelays);
    return [reqRelayPeerId, respRelayPeerId];
}

function versionMatches(routePerfs: ExitPerf[]): ExitPerf[] {
    return routePerfs.filter(({ version }) => {
        if (version) {
            return ExitNodesCompatVersions.some((v) => version.startsWith(v));
        }
        // do not exclude not yet determined ones
        return true;
    });
}

export function isSuccess(
    sel: Selection,
): sel is { result: Result.Success; match: NodeMatch.NodeMatch; via: string } {
    return sel.result === Result.Success;
}
