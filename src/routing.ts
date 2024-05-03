import * as DPapi from './dp-api';
import * as EntryNode from './entry-node';
import * as NodeAPI from './node-api';
import * as NodesCollector from './routing/nodes-collector';
import * as Payload from './payload';
import * as Request from './request';
import * as RequestCache from './routing/request-cache';
import * as Response from './response';
import * as Result from './result';
import * as RoutingUtils from './routing/utils';
import * as Segment from './segment';
import * as SegmentCache from './routing/segment-cache';
import * as Utils from './utils';
import Version from './version';

/**
 * pHTTP settings configure global behaviour of routing lib.
 * See **defaultSettings** for defaults.
 *
 * @param discoveryPlatformEndpoint discovery platform API endpoint
 * @param timeout - timeout for receiving responses
 * @param forceZeroHop - disable routing protection
 * @param debugScope - programatically set debug scope for SDK
 * @param logLevel - only print log statements that match at least the desired level: verbose < info < warn < error
 * @param forceManualRelaying - determine relay nodes for requests/responses and enforce them for one hop messages, can not be used with zero hop
 * @param measureLatency - determine duration of actual request from exit node, populates response stats
 */
export type Settings = {
    readonly discoveryPlatformEndpoint?: string;
    readonly timeout?: number;
    readonly forceZeroHop?: boolean;
    readonly debugScope?: string;
    readonly logLevel?: string; // 'verbose' | 'info' | 'warn' | 'error'
    readonly forceManualRelaying?: boolean;
    readonly measureLatency?: boolean;
};

const log = RoutingUtils.logger(['phttp-lib']);

// message tag - more like port since we tag all our messages the same
// 0xffff reserved for Availability Monitor
const ApplicationTag = Math.floor(Math.random() * 0xfffe);

/**
 * Global defaults.
 * See **Ops** for details.
 **/
const defaultSettings = {
    discoveryPlatformEndpoint: 'https://discovery.rpch.tech',
    forceManualRelaying: false,
    forceZeroHop: false,
    logLevel: 'info',
    measureLatency: false,
    timeout: 10e3,
};

export type FetchOptions = {
    body?: string;
    browsingTopics?: boolean;
    cache?: string;
    credentials?: string;
    headers?: Headers | Record<string, string>;
    integrity?: string;
    keepalive?: boolean;
    method?: string;
    mode?: string;
    priority?: string;
    redirect?: string;
    referrer?: string;
    referrerPolicy?: string;
    signal?: AbortSignal;
    timeout?: number;
};

/**
 * Send traffic through the RPCh network
 */
export class Routing {
    private readonly requestCache: RequestCache.Cache;
    private readonly segmentCache: SegmentCache.Cache;
    private readonly redoRequests: Set<string> = new Set();
    private readonly nodesColl: NodesCollector.NodesCollector;
    private readonly settings;
    private readonly hops?: number;

    /**
     * Construct a routing lib instance providing a fetch shim when ready.
     * @param cliendId your unique string used to identify how many requests your client pushes through the network
     * @param settings, see **Settings**
     **/
    constructor(
        private readonly clientId: string,
        settings?: Settings,
    ) {
        this.settings = this.mergeSettings(settings);
        if (settings?.debugScope || settings?.logLevel) {
            RoutingUtils.setDebugScopeLevel(
                defaultSettings.logLevel,
                this.settings.debugScope,
                this.settings.logLevel,
            );
        }
        this.requestCache = RequestCache.init();
        this.segmentCache = SegmentCache.init();
        this.hops = this.determineHops(this.settings.forceZeroHop);
        this.nodesColl = new NodesCollector.NodesCollector(
            this.settings.discoveryPlatformEndpoint,
            this.clientId,
            ApplicationTag,
            this.onMessages,
            this.onVersions,
            this.hops,
            this.settings.forceManualRelaying,
        );
        log.info('pHTTP routing[v%s] started', Version);
    }

    /**
     * Stop listeners and free acquired resources.
     */
    public destruct = () => {
        this.nodesColl.destruct();
        for (const [rId] of this.requestCache) {
            RequestCache.remove(this.requestCache, rId);
            SegmentCache.remove(this.segmentCache, rId);
        }
    };

    public fetch = async (
        endpoint: URL | string,
        options?: FetchOptions,
    ): Promise<Response.Response> => {
        // throw on everything we are unable to do for now
        [
            'browsingTopics',
            'cache',
            'credentials',
            'integrity',
            'keepalive',
            'mode',
            'priority',
            'redirect',
            'referrer',
            'referrerPolicy',
            'signal',
        ].forEach((o) => {
            if (options && o in options) {
                throw new Error(`${o} is not supported yet`);
            }
        });

        const timeout = options?.timeout ?? this.settings.timeout;

        // gather entry - exit node pair
        const resNodes = await this.nodesColl.requestNodePair(timeout).catch((err) => {
            log.error('Error finding node pair', err);
            throw err;
        });

        const { entryNode, exitNode, counterOffset } = resNodes;
        const id = RequestCache.generateId(this.requestCache);
        const exitPublicKey = Utils.hexStringToBytes(exitNode.pubKey);
        const reqOpts: Request.CreateOptions = {
            id,
            clientId: this.clientId,
            provider: endpoint.toString(),
            entryPeerId: entryNode.id,
            exitPeerId: exitNode.id,
            exitPublicKey,
            counterOffset,
            hops: this.hops,
            measureLatency: this.settings.measureLatency,
            timeout,
        };
        if (this.settings.forceManualRelaying) {
            reqOpts.reqRelayPeerId = resNodes.reqRelayPeerId;
            reqOpts.respRelayPeerId = resNodes.respRelayPeerId;
        }
        if (options?.headers) {
            reqOpts.headers = Utils.headersRecord(options.headers);
        }
        if (options?.body) {
            reqOpts.body = options.body;
        }
        if (options?.method) {
            reqOpts.method = options.method;
        }

        // create request
        const resReq = Request.create(reqOpts);
        if (Result.isErr(resReq)) {
            log.error('error creating request', resReq.error);
            throw new Error('Unable to create request object');
        }

        // split request to segments
        const { request, session } = resReq.res;
        const segments = Request.toSegments(request, session);

        // set request expiration timer
        const timer = setTimeout(() => {
            log.error('%s expired after %dms timeout', Request.prettyPrint(request), timeout);
            this.removeRequest(request);
            throw new Error('Request timed out');
        }, timeout);

        return new Promise((resolve, reject) => {
            // keep tabs on request
            const entry = RequestCache.add(this.requestCache, {
                request,
                resolve,
                reject,
                timer,
                session,
            });
            this.nodesColl.requestStarted(request);

            // send request to hoprd
            log.info('sending request %s', Request.prettyPrint(request));

            // queue segment sending for all of them
            segments.forEach((s) => {
                this.nodesColl.segmentStarted(request, s);
                this.sendSegment(request, s, entryNode, entry);
            });
        });
    };

    private sendSegment = (
        request: Request.Request,
        segment: Segment.Segment,
        entryNode: EntryNode.EntryNode,
        cacheEntry: RequestCache.Entry,
    ) => {
        const bef = performance.now();
        const conn = {
            apiEndpoint: entryNode.apiEndpoint,
            accessToken: entryNode.accessToken,
            hops: request.hops,
            relay: request.reqRelayPeerId,
        };
        NodeAPI.sendMessage(conn, {
            recipient: request.exitPeerId,
            tag: ApplicationTag,
            message: Segment.toMessage(segment),
        })
            .then((_json) => {
                const aft = performance.now();
                request.lastSegmentEndedAt = aft;
                const dur = Math.round(aft - bef);
                this.nodesColl.segmentSucceeded(request, segment, dur);
            })
            .catch((error) => {
                log.error('error sending %s: %o', Segment.prettyPrint(segment), error);
                this.nodesColl.segmentFailed(request, segment);
                this.resendRequest(request, entryNode, cacheEntry);
            });
    };

    private resendRequest = (
        origReq: Request.Request,
        entryNode: EntryNode.EntryNode,
        cacheEntry: RequestCache.Entry,
    ) => {
        if (this.redoRequests.has(origReq.id)) {
            log.verbose('ignoring already triggered resend', origReq.id);
            return;
        }

        // TODO track request after segments have been sent
        this.removeRequest(origReq);

        const fallback = this.nodesColl.fallbackNodePair(entryNode);
        if (!fallback) {
            log.info('no fallback for resending request available');
            throw new Error('No fallback node pair to retry sending request');
        }

        this.redoRequests.add(origReq.id);
        if (fallback.entryNode.id === origReq.entryPeerId) {
            log.info('fallback entry node same as original entry node - still trying');
        }
        if (fallback.exitNode.id === origReq.exitPeerId) {
            log.info('fallback exit node same as original exit node - still trying');
        }

        // generate new request
        const id = RequestCache.generateId(this.requestCache);
        const exitPublicKey = Utils.hexStringToBytes(fallback.exitNode.pubKey);
        const resReq = Request.create({
            id,
            originalId: origReq.id,
            provider: origReq.provider,
            body: origReq.body,
            clientId: this.clientId,
            entryPeerId: fallback.entryNode.id,
            exitPeerId: fallback.exitNode.id,
            exitPublicKey,
            counterOffset: fallback.counterOffset,
            measureLatency: origReq.measureLatency,
            headers: origReq.headers,
            hops: origReq.hops,
            reqRelayPeerId: fallback.reqRelayPeerId,
            respRelayPeerId: fallback.respRelayPeerId,
        });

        if (Result.isErr(resReq)) {
            log.error('error creating fallback request', resReq.error);
            throw new Error('Unable to create fallback request object');
        }

        // split request to segments
        const { request, session } = resReq.res;
        const segments = Request.toSegments(request, session);

        // track request
        const newCacheEntry = RequestCache.add(this.requestCache, {
            request,
            resolve: cacheEntry.resolve,
            reject: cacheEntry.reject,
            timer: cacheEntry.timer,
            session,
        });
        this.nodesColl.requestStarted(request);

        // send request to hoprd
        log.info('resending request %s', Request.prettyPrint(request));

        // send segments sequentially
        segments.forEach((s) => this.resendSegment(s, request, entryNode, newCacheEntry));
    };

    private resendSegment = (
        segment: Segment.Segment,
        request: Request.Request,
        entryNode: EntryNode.EntryNode,
        cacheEntry: RequestCache.Entry,
    ) => {
        const bef = performance.now();
        NodeAPI.sendMessage(
            {
                apiEndpoint: entryNode.apiEndpoint,
                accessToken: entryNode.accessToken,
                hops: request.hops,
                relay: request.reqRelayPeerId,
            },
            {
                recipient: request.exitPeerId,
                tag: ApplicationTag,
                message: Segment.toMessage(segment),
            },
        )
            .then((_json) => {
                const aft = performance.now();
                request.lastSegmentEndedAt = aft;
                const dur = Math.round(aft - bef);
                this.nodesColl.segmentSucceeded(request, segment, dur);
            })
            .catch((error) => {
                log.error('error resending %s: %o', Segment.prettyPrint(segment), error);
                this.nodesColl.segmentFailed(request, segment);
                this.removeRequest(request);
                return cacheEntry.reject('Sending message failed');
            });
    };

    // handle incoming messages
    private onMessages = (messages: NodeAPI.Message[]) => {
        messages.forEach(({ body }) => {
            const segRes = Segment.fromMessage(body);
            if (Result.isErr(segRes)) {
                log.info('cannot create segment', segRes.error);
                return;
            }
            const segment = segRes.res;
            if (!this.requestCache.has(segment.requestId)) {
                log.info('dropping unrelated request segment', Segment.prettyPrint(segment));
                return;
            }

            const cacheRes = SegmentCache.incoming(this.segmentCache, segment);
            switch (cacheRes.res) {
                case 'complete':
                    log.verbose('completion segment', Segment.prettyPrint(segment));
                    this.completeSegmentsEntry(cacheRes.entry as SegmentCache.Entry);
                    break;
                case 'error':
                    log.error('error caching segment', cacheRes.reason);
                    break;
                case 'already-cached':
                    log.info('already cached', Segment.prettyPrint(segment));
                    break;
                case 'inserted-new':
                    log.verbose('inserted new first segment', Segment.prettyPrint(segment));
                    break;
                case 'added-to-request':
                    log.verbose(
                        'inserted new segment to existing requestId',
                        Segment.prettyPrint(segment),
                    );
                    break;
            }
        });
    };

    private completeSegmentsEntry = (entry: SegmentCache.Entry) => {
        const firstSeg = entry.segments.get(0) as Segment.Segment;
        const reqEntry = this.requestCache.get(firstSeg.requestId) as RequestCache.Entry;
        const { request, session } = reqEntry;
        RequestCache.remove(this.requestCache, request.id);

        const msgData = SegmentCache.toMessage(entry);
        const msgBytes = Utils.base64ToBytes(msgData);

        const resUnbox = Response.messageToResp({
            respData: msgBytes,
            request,
            session,
        });
        if (Result.isOk(resUnbox)) {
            return this.responseSuccess(resUnbox.res, reqEntry);
        }
        return this.responseError(resUnbox.error, reqEntry);
    };

    private responseError = (error: string, reqEntry: RequestCache.Entry) => {
        log.error('error extracting message', error);
        const request = reqEntry.request;
        this.nodesColl.requestFailed(request);
        return reqEntry.reject('Unable to process response');
    };

    private responseSuccess = ({ resp }: Response.UnboxResponse, reqEntry: RequestCache.Entry) => {
        const { request, reject, resolve } = reqEntry;
        const responseTime = Math.round(performance.now() - request.startedAt);
        const stats = this.stats(responseTime, request, resp);
        log.verbose('response time for request %s: %d ms %o', request.id, responseTime, stats);
        this.nodesColl.requestSucceeded(request, responseTime);

        switch (resp.type) {
            case Payload.RespType.Resp: {
                const r: Response.Response = {
                    status: resp.status,
                    statusText: resp.statusText,
                    headers: resp.headers,
                    text: resp.text,
                };
                if (request.measureLatency) {
                    r.stats = stats;
                }
                return resolve(r);
            }
            case Payload.RespType.CounterFail: {
                const counter = reqEntry.session.updatedTS;
                return reject(
                    `Message out of counter range. Exit node expected message counter near ${resp.counter} - request got ${counter}.`,
                );
            }
            case Payload.RespType.DuplicateFail:
                return reject(
                    'Message duplicate error. Exit node rejected already processed message',
                );
            case Payload.RespType.Error:
                return reject(`Error attempting call: ${JSON.stringify(resp)}`);
        }
    };

    private removeRequest = (request: Request.Request) => {
        this.nodesColl.requestFailed(request);
        RequestCache.remove(this.requestCache, request.id);
        SegmentCache.remove(this.segmentCache, request.id);
        if (request.originalId) {
            this.redoRequests.delete(request.originalId);
        }
    };

    private mergeSettings = (settings?: Settings) => {
        const merged = {
            ...defaultSettings,
            ...settings,
        };
        const forceManualRelaying = merged.forceZeroHop ? false : merged.forceManualRelaying;
        return {
            ...merged,
            forceManualRelaying,
        };
    };

    private determineHops = (forceZeroHop: boolean) => {
        if (forceZeroHop) {
            return 0;
        }
        return 1;
    };

    private onVersions = (_versions: DPapi.Versions) => {
        // TODO provide versioning info from backend
        /*
        const vLib = versions.phttpLib;
        const cmp = Utils.versionCompare(vLib, Version);
        if (Result.isOk(cmp)) {
            switch (cmp.res) {
                case Utils.VrsnCmp.Identical:
                    log.verbose('pHTTP-lib[v%s] is up to date', Version);
                    break;
                case Utils.VrsnCmp.PatchMismatch:
                    log.info('pHTTP-lib[v%s] can be updated to v%s.', Version, vLib);
                    break;
                case Utils.VrsnCmp.MinorMismatch:
                    log.warn('pHTTP-lib[v%s] needs to update to v%s.', Version, vLib);
                    break;
                case Utils.VrsnCmp.MajorMismatch:
                    log.error('pHTTP-lib[v%s] must be updated to v%s!', Version, vLib);
                    break;
            }
        } else {
            log.error('error comparing versions: %s', cmp.error);
        }
        */
    };

    private stats = (responseTime: number, request: Request.Request, resp: Payload.RespPayload) => {
        const segDur = Math.round((request.lastSegmentEndedAt as number) - request.startedAt);
        if (
            request.measureLatency &&
            'callDuration' in resp &&
            'exitAppDuration' in resp &&
            resp.callDuration &&
            resp.exitAppDuration
        ) {
            const rpcDur = resp.callDuration;
            const exitAppDur = resp.exitAppDuration;
            const hoprDur = responseTime - rpcDur - exitAppDur - segDur;
            return {
                segDur,
                rpcDur,
                exitAppDur,
                hoprDur,
            };
        }
        return { segDur };
    };

    private errHeaders = (headers?: Record<string, string>): Record<string, string> => {
        return { ...headers, 'Content-Type': 'application/json' };
    };
}
