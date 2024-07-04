import * as DPapi from '../dp-api';
import * as EntryNode from '../entry-node';
import * as ExitNode from '../exit-node';
import * as MessageListener from './node-pair';
import * as NodeMatch from './node-match';
import * as Request from '../request';
import * as Segment from '../segment';
import * as Utils from '../utils';

import * as NodePair from './node-pair';
import * as NodeSel from './node-selector';
import * as RoutingUtils from './utils';

const log = RoutingUtils.logger(['uhttp-lib', 'routing']);

const RoutesFetchInterval = 1e3 * 60 * 10; // 10 min
const RoutesAmount = 10; // fetch 10 routes

export class NodesCollector {
    private readonly nodePairs: Map<string, NodePair.NodePair> = new Map();

    constructor(
        private readonly discoveryPlatformEndpoint: string,
        private readonly clientId: string,
        private readonly applicationTag: number,
        private readonly messageListener: MessageListener.MessageListener,
        private readonly hops: number,
        private readonly forceManualRelaying: boolean,
    ) {
        this.fetchRoutes();
    }

    public destruct = () => {
        for (const np of this.nodePairs.values()) {
            NodePair.destruct(np);
        }
        this.nodePairs.clear();
    };

    /**
     * Request primary node pair.
     */
    public requestNodePair = async (timeout: number): Promise<NodeMatch.NodeMatch> => {
        return new Promise((resolve, reject) => {
            const start = performance.now();
            const check = () => {
                const now = performance.now();
                const elapsed = now - start;
                const res = NodeSel.routePair(this.nodePairs, this.forceManualRelaying);

                if (NodeSel.isSuccess(res)) {
                    log.verbose('found route pair: %s', NodeSel.prettyPrint(res));
                    return resolve(res.match);
                }

                if (elapsed > timeout) {
                    log.error(
                        'timeout after %d waiting for node pair: %s',
                        elapsed,
                        NodeSel.prettyPrint(res),
                    );
                    return reject(`Timeout after ${elapsed} ms: ${NodeSel.prettyPrint(res)}`);
                }
                setTimeout(check, 100);
            };
            check();
        });
    };

    /**
     * Request secondary node pair.
     */
    public fallbackNodePair = (exclude: EntryNode.EntryNode): NodeMatch.NodeMatch | undefined => {
        const res = NodeSel.fallbackRoutePair(this.nodePairs, exclude, this.forceManualRelaying);
        if (NodeSel.isSuccess(res)) {
            log.verbose('found fallback route pair: %s', NodeSel.prettyPrint(res));
            return res.match;
        }
    };

    public requestStarted = (req: Request.Request) => {
        const np = this.nodePairs.get(req.entryPeerId);
        if (!np) {
            log.error('started %s on non existing node pair', Request.prettyPrint(req));
            return;
        }
        NodePair.requestStarted(np, req);
        log.verbose('started %s on %s', Request.prettyPrint(req), NodePair.prettyPrint(np));
    };

    public requestSucceeded = (req: Request.Request, responseTime: number) => {
        const np = this.nodePairs.get(req.entryPeerId);
        if (!np) {
            log.error('successful %s on non existing node pair', Request.prettyPrint(req));
            return;
        }
        NodePair.requestSucceeded(np, req, responseTime);
        log.info('successful %s on %s', Request.prettyPrint(req), NodePair.prettyPrint(np));
    };

    public requestFailed = (req: Request.Request) => {
        const np = this.nodePairs.get(req.entryPeerId);
        if (!np) {
            log.error('failed %s on non exiting node pair', Request.prettyPrint(req));
            return;
        }
        NodePair.requestFailed(np, req);
        log.warn('failed %s on %s', Request.prettyPrint(req), NodePair.prettyPrint(np));
    };

    public segmentStarted = (req: Request.Request, seg: Segment.Segment) => {
        const np = this.nodePairs.get(req.entryPeerId);
        if (!np) {
            log.error('started %s on non existing node pair', Segment.prettyPrint(seg));
            return;
        }
        NodePair.segmentStarted(np, seg);
        log.verbose('started %s on %s', Segment.prettyPrint(seg), NodePair.prettyPrint(np));
    };

    public segmentSucceeded = (
        req: Request.Request,
        seg: Segment.Segment,
        responseTime: number,
    ) => {
        const np = this.nodePairs.get(req.entryPeerId);
        if (!np) {
            log.error('successful %s on non existing node pair', Segment.prettyPrint(seg), '');
            return;
        }
        NodePair.segmentSucceeded(np, seg, responseTime);
        log.verbose('successful %s on %s', Segment.prettyPrint(seg), NodePair.prettyPrint(np));
    };

    public segmentFailed = (req: Request.Request, seg: Segment.Segment) => {
        const np = this.nodePairs.get(req.entryPeerId);
        if (!np) {
            log.error('failed %s on non existing node pair', Segment.prettyPrint(seg));
            return;
        }
        NodePair.segmentFailed(np, seg);
        log.warn('failed %s on %s', Segment.prettyPrint(seg), NodePair.prettyPrint(np));
    };

    private fetchRoutes = () => {
        DPapi.getNodes(
            {
                discoveryPlatformEndpoint: this.discoveryPlatformEndpoint,
                clientId: this.clientId,
                forceZeroHop: this.hops === 0,
            },
            RoutesAmount,
        )
            .then(this.initNodes)
            .catch((err) => {
                if ('cause' in err && 'code' in err.cause && err.cause.code === 'ECONNREFUSED') {
                    this.logDPoffline();
                } else if (err.message === DPapi.Unauthorized) {
                    this.logUnauthorized();
                } else if (err.message === DPapi.NoMoreNodes && this.nodePairs.size === 0) {
                    this.logNoNodes();
                } else if (err.message === DPapi.NoMoreNodes) {
                    log.verbose('no new nodes found');
                } else {
                    log.error('error fetching node pairs: %s[%o]', JSON.stringify(err), err);
                }
            })
            .finally(() => {
                this.scheduleFetchRoutes();
            });
    };

    private initNodes = (nodes: DPapi.Nodes) => {
        const lookupExitNodes = new Map(nodes.exitNodes.map((x) => [x.id, x]));
        for (const en of nodes.entryNodes) {
            const exitNodes = en.recommendedExits
                .map((id) => lookupExitNodes.get(id) as ExitNode.ExitNode)
                // ensure entry node not included in exits
                .filter((x) => x.id !== en.id);

            if (exitNodes.length === 0) {
                return;
            }

            if (this.nodePairs.has(en.id)) {
                const np = this.nodePairs.get(en.id) as NodePair.NodePair;
                NodePair.addExitNodes(np, exitNodes);
            } else {
                const np = NodePair.create(
                    en,
                    exitNodes,
                    this.applicationTag,
                    this.messageListener,
                    this.hops,
                    this.forceManualRelaying,
                );
                this.nodePairs.set(NodePair.id(np), np);
            }
        }

        this.removeRedundant();

        // ping all nodes
        for (const [, np] of this.nodePairs) {
            NodePair.discover(np);
        }
        log.info(
            'discovered %d node-pairs with %d exits, matched at %s',
            this.nodePairs.size,
            lookupExitNodes.size,
            new Date(nodes.matchedAt),
        );
    };

    private scheduleFetchRoutes = () => {
        // schdule next run somehwere between 10min and 12min
        const next = RoutesFetchInterval + Math.floor(Math.random() * 2 * 60e3);
        const logM = Math.floor(next / 1000 / 60);
        const logS = Math.round(next / 1000) - logM * 60;

        log.verbose('scheduling next node pair fetching in %dm%ds', logM, logS);
        setTimeout(() => this.fetchRoutes(), next);
    };

    private logDPoffline = () => {
        const errMessage = [
            '***',
            'Discovery Platform appears offline',
            '-',
            'Do you have internet access?',
            '***',
        ].join(' ');
        const errDeco = Array.from({ length: errMessage.length }, () => '*').join('');
        log.error('');
        log.error(`!!! ${errDeco} !!!`);
        log.error(`!!! ${errMessage} !!!`);
        log.error(`!!! ${errDeco} !!!`);
        log.error('');
        this.destruct();
    };

    private logUnauthorized = () => {
        const errMessage = [
            '***',
            'Authentication failed',
            '-',
            'Client ID is not valid.',
            'Visit https://access.rpch.net to get a valid Client ID!',
            '***',
        ].join(' ');
        const errDeco = Array.from({ length: errMessage.length }, () => '*').join('');
        log.error('');
        log.error(`!!! ${errDeco} !!!`);
        log.error(`!!! ${errMessage} !!!`);
        log.error(`!!! ${errDeco} !!!`);
        log.error('');
        this.destruct();
    };

    private logNoNodes = () => {
        const errMessage = [
            '***',
            'No node pairs available.',
            'Contact support at https://access.rpch.net to report this problem!',
            '***',
        ].join(' ');
        const errDeco = Array.from({ length: errMessage.length }, () => '*').join('');
        log.error('');
        log.error(`!!! ${errDeco} !!!`);
        log.error(`!!! ${errMessage} !!!`);
        log.error(`!!! ${errDeco} !!!`);
        log.error('');
    };

    private removeRedundant = () => {
        const count = Array.from(this.nodePairs).reduce<number>(
            (acc, [_, np]) => np.exitNodes.size + acc,
            0,
        );
        let toRemove = count - RoutesAmount;
        if (toRemove <= 0) {
            return;
        }
        const removablePairs = Array.from(this.nodePairs).reduce<[string, string][]>(
            (acc, [eId, np]) => {
                const removableExitIds = Array.from(np.exitNodes.keys()).filter((xId) => {
                    const exitData = np.exitDatas.get(xId);
                    if (!exitData) {
                        return true;
                    }
                    return exitData.requestsOngoing.length === 0;
                });
                return acc.concat(removableExitIds.map((xId) => [eId, xId]));
            },
            [],
        );
        log.verbose('removing %d redundant routes', removablePairs.length);
        while (removablePairs.length > 0 && toRemove > 0) {
            const idx = Utils.randomIdx(removablePairs);
            const [eId, xId] = removablePairs[idx] as [string, string];
            const np = this.nodePairs.get(eId);
            if (np) {
                NodePair.removeExitNode(np, xId);
                if (np.exitNodes.size === 0) {
                    NodePair.destruct(np);
                    this.nodePairs.delete(eId);
                }
                toRemove--;
                removablePairs.splice(idx, 1);
                if (toRemove === 0) {
                    return;
                }
            }
        }
    };
}
