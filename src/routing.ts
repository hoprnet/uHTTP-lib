import * as EntryNode from './entry-node';
import * as NodeAPI from './node-api';
import * as NodesCollector from './routing/nodes-collector';
import * as Payload from './payload';
import * as Request from './request';
import * as RequestCache from './routing/request-cache';
import * as IntResp from './response';
import * as Result from './result';
import * as RoutingUtils from './routing/utils';
import * as Segment from './segment';
import * as SegmentCache from './routing/segment-cache';
import * as Utils from './utils';
import Version from './version';

/**
 * uHTTP settings configure global behaviour of routing client.
 * See **defaultSettings** for defaults.
 *
 * @param discoveryPlatformEndpoint discovery platform API endpoint
 * @param timeout - timeout for receiving responses
 * @param forceZeroHop - force no additional hop through the network
 * @param clientAssociatedExitNodes - query only routes that contain our client associated exit gateways - only viable if you have exit gateways registered with your client
 * @param debugScope - programatically set debug scope for SDK
 * @param logLevel - only print log statements that match at least the desired level: verbose < info < warn < error
 * @param forceManualRelaying - determine relay nodes for requests/responses and enforce them for one hop messages, can not be used with zero hop
 * @param measureLatency - determine duration of actual request from exit node, prints response stats
 */
export type Settings = {
    readonly discoveryPlatformEndpoint?: string;
    readonly timeout?: number;
    readonly forceZeroHop?: boolean;
    readonly clientAssociatedExitNodes?: boolean;
    readonly debugScope?: string;
    readonly logLevel?: string; // 'verbose' | 'info' | 'warn' | 'error'
    readonly forceManualRelaying?: boolean;
    readonly measureLatency?: boolean;
};

/**
 * uHTTP stats for detailed latency analysis - only available if **measureLatency** is enabled
 *
 */
export type LatencyStatistics = {
    segDur: number; // time spent sending all request segments
    rpcDur: number; // time exit app spent making the actual request
    exitAppDur: number; // time exit app spent reconstructing request
    hoprDur: number; // approximate time all segments took routing through hoprnet back and forth
};

/**
 * uHTTP stimple latency stats without **measureLatency** set
 *
 */
export type ReducedLatencyStatistics = {
    segDur: number; // time spent sending all request segments
};

/**
 * Use this to intercept the request manually before it gets encrypted and packaged to be sent to the network.
 * Can be used for logging or mangling of the final request.
 */
export type OnRequestCreationHandler = (
    requestOptions: Request.CreateOptions,
) => Request.CreateOptions;

/**
 * Use this to intercept latency statistics reporting.
 * Will only contain full **LatencyStatistics** if **measureLatency** is enabled.
 */
export type OnLatencyStatisticsHandler = (
    stats: LatencyStatistics | ReducedLatencyStatistics,
) => void;

/**
 * Specify a RegExp that can match request URLs.
 * Or provide a function that returns true if the **URLMatcher** should *match*.
 */
export type URLMatcher = (
    endpoint: URL | string,
    // @ts-expect-error globalThis.RequestInit works in TS but not in node
    params?: typeof globalThis.RequestInit,
) => boolean;

const log = RoutingUtils.logger(['uhttp-lib']);
let _globalClient: Client;

// message tag - more like port since we tag all our messages the same
// 0xffff reserved for Availability Monitor
// 0x0000 to 0x3fff reserved for privileged applications
const ApplicationTag = Math.floor(Math.random() * (0xffff - 0x0400) + 0x0400);

/**
 * Global defaults.
 * See **Ops** for details.
 **/
const defaultSettings = {
    discoveryPlatformEndpoint: 'https://discovery.rpch.tech',
    forceManualRelaying: false,
    forceZeroHop: false,
    clientAssociatedExitNodes: false,
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

const globalFetch = globalThis.fetch.bind(globalThis);

/**
 * Send traffic through uHTTP network
 */
export class Client {
    private readonly requestCache: RequestCache.Cache;
    private readonly segmentCache: SegmentCache.Cache;
    private readonly redoRequests: Set<string> = new Set();
    private readonly nodesColl: NodesCollector.NodesCollector;
    private readonly settings;
    private readonly hops?: number;
    public onRequestCreationHandler: OnRequestCreationHandler = (r) => r;
    public onLatencyStatisticsHandler: OnLatencyStatisticsHandler = (_) => {};

    /**
     * Construct a routing client instance providing a fetch shim when ready.
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
            globalFetch,
            this.settings.discoveryPlatformEndpoint,
            this.clientId,
            ApplicationTag,
            this.onMessages,
            this.hops,
            this.settings.clientAssociatedExitNodes,
            this.settings.forceManualRelaying,
        );
        log.info('uHTTP client[v%s] started', Version);
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

    /**
     * Check if a route combination of entry and exit node is available.
     */
    public isReady = async (timeout?: number): Promise<boolean> => {
        const tmt = timeout ?? this.settings.timeout;
        try {
            await this.nodesColl.requestNodePair(tmt);
        } catch (err) {
            log.warn('Error finding node pair during isReady: %s', err);
            return false;
        }
        return true;
    };

    /**
     * Create a fetch request similar to fetchAPI.
     * Throws error on yet unsupported options.
     *
     * Returns fetch typical Response object.
     */
    public fetch = async (endpoint: URL | string, options?: FetchOptions): Promise<Response> => {
        // throw on everything we are unable to do for now
        if (options) {
            for (const key of [
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
            ]) {
                if (key in options) {
                    throw new Error(`${key} is not supported yet`);
                }
            }
        }

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
            reqOpts.headers = Utils.headersToRecord(options.headers);
        }
        if (options?.body) {
            reqOpts.body = options.body;
        }
        if (options?.method) {
            reqOpts.method = options.method;
        }

        // adjust request externally
        const adjustedReqOpts = this.onRequestCreationHandler(reqOpts);

        // create request
        const resReq = Request.create(adjustedReqOpts);
        if (Result.isErr(resReq)) {
            log.error('error creating request', resReq.error);
            throw new Error('Unable to create request object');
        }

        // split request to segments
        const { request, session } = resReq.res;
        const segments = Request.toSegments(request, session);

        return new Promise((resolve, reject) => {
            // set request expiration timer
            const timer = setTimeout(() => {
                log.error('%s expired after %dms timeout', Request.prettyPrint(request), timeout);
                this.removeRequest(request);
                reject('Request timed out');
            }, timeout);

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
            for (const s of segments) {
                this.nodesColl.segmentStarted(request, s);
                this.sendSegment(request, s, entryNode, entry);
            }
        });
    };

    /**
     * Use this function to selectively override global fetch API calls.
     * Any matching calls to fetch will be routed through uHTTP.
     *
     * Restore original fetch with **restoreGlobalFetch**.
     */
    public overrideGlobalFetch = (urlMatcher: URLMatcher) => {
        // TODO fix types
        // @ts-expect-error will fix types later
        globalThis.fetch = async function (
            endpoint: URL | string,
            // @ts-expect-error globalThis.RequestInit works in TS but not in node
            params?: typeof globalThis.RequestInit,
        ) {
            if (typeof urlMatcher === 'function' && urlMatcher(endpoint, params)) {
                const origin = window?.location.origin ?? endpoint;
                const url = new URL(endpoint, origin);
                return this.fetch(url, params);
            }

            if (urlMatcher instanceof RegExp && endpoint.toString().match(urlMatcher)) {
                const origin = window?.location.origin ?? endpoint;
                const url = new URL(endpoint, origin);
                return this.fetch(url, params);
            }

            return globalFetch(endpoint, params);
        };
    };

    /**
     * Restore global fetch API after overriding it with **overrideGlobalFetch**.
     */
    public restoreGlobalFetch = () => {
        globalThis.fetch = globalFetch;
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
            pinnedFetch: globalFetch,
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
        for (const s of segments) {
            this.resendSegment(s, request, entryNode, newCacheEntry);
        }
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
                pinnedFetch: globalFetch,
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
        for (const { body } of messages) {
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
        }
    };

    private completeSegmentsEntry = (entry: SegmentCache.Entry) => {
        const firstSeg = entry.segments.get(0) as Segment.Segment;
        const reqEntry = this.requestCache.get(firstSeg.requestId) as RequestCache.Entry;
        const { request, session } = reqEntry;
        RequestCache.remove(this.requestCache, request.id);

        const msgData = SegmentCache.toMessage(entry);
        const resMsgBytes = Utils.base64ToBytes(msgData);
        if (Result.isErr(resMsgBytes)) {
            return this.responseError(resMsgBytes.error, reqEntry);
        }

        const msgBytes = resMsgBytes.res;
        const resUnbox = IntResp.messageToResp({
            respData: msgBytes,
            request,
            session,
        });
        if (Result.isErr(resUnbox)) {
            return this.responseError(resUnbox.error, reqEntry);
        }

        return this.responseSuccess(resUnbox.res, reqEntry);
    };

    private responseError = (error: string, reqEntry: RequestCache.Entry) => {
        log.error('error extracting message', error);
        const request = reqEntry.request;
        this.nodesColl.requestFailed(request);
        return reqEntry.reject('Unable to process response');
    };

    private responseSuccess = ({ resp }: IntResp.UnboxResponse, reqEntry: RequestCache.Entry) => {
        const { request, reject, resolve } = reqEntry;
        const responseTime = Math.round(performance.now() - request.startedAt);
        const stats = this.stats(responseTime, request, resp);
        log.verbose('response time for request %s: %d ms %o', request.id, responseTime, stats);
        this.nodesColl.requestSucceeded(request, responseTime);

        switch (resp.type) {
            case Payload.RespType.Resp: {
                if (resp.data) {
                    const d = new Uint8Array(resp.data);
                    return resolve(new Response(d, resp));
                }
                return resolve(new Response(null, resp));
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
            const stats = { segDur, rpcDur, exitAppDur, hoprDur };
            this.onLatencyStatisticsHandler(stats);
            return stats;
        }
        const stats = { segDur };
        this.onLatencyStatisticsHandler(stats);
        return stats;
    };

    private errHeaders = (headers?: Record<string, string>): Record<string, string> => {
        return { ...headers, 'Content-Type': 'application/json' };
    };
}

/**
 * Singleton wrapper around **Client** for convenience reasons.
 *
 * Create a new instance of **Client** or get existing one.
 * Can be called without arguments after initialization.
 */
export function globalClient(clientId?: string, settings?: Settings): Client {
    if (_globalClient) {
        return _globalClient;
    }
    if (!clientId) {
        const msg = [
            'Cannot instantiate uHTTP Client without a clientId.',
            'If you want to use globalClient singleton instance without providing a clientId,',
            'make sure you call `globalClient(clientId)` at least once before!',
        ].join('\n');
        throw new Error(msg);
    }
    _globalClient = new Client(clientId, settings);
    return _globalClient;
}

/**
 * Typescript helper for **LatencyStatistics** type.
 */
export function isLatencyStatistics(
    stats: LatencyStatistics | ReducedLatencyStatistics,
): stats is LatencyStatistics {
    return 'hoprDur' in stats;
}
