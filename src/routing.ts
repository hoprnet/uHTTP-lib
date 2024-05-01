import * as RequestCache from './routing/request-cache';
import * as SegmentCache from './routing/segment-cache';

export type Routing = {
    requestCache: RequestCache.Cache;
    segmentCache: SegmentCache.Cache;
    settings: Settings;
};

export type Settings = {};

export function init(settings?: Settings): Routing {
    const mergedSettings = mergeDefault(settings);
    return {
        requestCache: RequestCache.init(),
        segmentCache: SegmentCache.init(),
        settings: mergedSettings,
    };
}

export function fetch(routing: Routing) {}

function mergeDefault(settings?: Settings): Settings {
    return {};
}
