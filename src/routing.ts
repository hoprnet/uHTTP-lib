import * as RequestCache from './routing/request-cache';
import * as SegmentCache from './routing/segment-cache';

export type Routing = {
    nodesColl: NodesCollector;
    redoRequests: Set<string> = new Set();
    requestCache: RequestCache.Cache;
    requestCache: RequestCache.Cache;
    segmentCache: SegmentCache.Cache;
    segmentCache: SegmentCache.Cache;
    settings: Settings;
};


export type Settings = {
    readonly discoveryPlatformEndpoint?: string;
    readonly timeout?: number;
    readonly provider?: string;
    readonly disableMevProtection?: boolean;
    readonly mevProtectionProvider?: string;
    readonly mevKickbackAddress?: string;
    readonly forceZeroHop?: boolean;
    readonly segmentLimit?: number;
    readonly versionListener?: (versions: DPapi.Versions) => void;
    readonly debugScope?: string;
    readonly logLevel?: string; // 'verbose' | 'info' | 'warn' | 'error'
    readonly forceManualRelaying?: boolean;
    readonly measureRPClatency?: boolean;
    readonly headers?: Record<string, string>;
};


export function init(settings?: Settings): Routing {
    const mergedSettings = mergeDefault(settings);
    return {
        redoRequests: new Set(),
        requestCache: RequestCache.init(),
        segmentCache: SegmentCache.init(),
        settings: mergedSettings,
    };
}

export function fetch(routing: Routing) {}

function mergeDefault(settings?: Settings): Settings {
    return {};
}
