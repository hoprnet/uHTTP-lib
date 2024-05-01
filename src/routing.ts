import * as RequestCache from './routing/request-cache';

export type Routing = {};

export function init(): Routing {
    return {
    private readonly requestCache: RequestCache.Cache;
    private readonly segmentCache: SegmentCache.Cache;
    private readonly redoRequests: Set<string> = new Set();
    private readonly nodesColl: NodesCollector;
    private readonly ops;
    private readonly chainIds: Map<string, string> = new Map();
    private readonly hops?: number;
    };
}

export function fetch(routing: Routing) {}
