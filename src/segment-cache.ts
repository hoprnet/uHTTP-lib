import type { Segment } from './segment';

export type Cache = {
    cache: Map<string, Entry>; // requestId -> Entry
    remainingSegmentReminder: RemainingSegmentReminder;
};

export type RemainingSegmentReminder = (requestId: string, segmentNrs: number[]) => void;

export type Entry = {
    requestId: string; // requestId for easy reference
    segments: Map<number, Segment>; // segmentNr -> Segment
    count: number; // count segments manually to avoid iterating whole map
    reminder?: ReturnType<typeof setTimeout>; // timeout reminder for missing segments
};

export function init(remainingSegmentReminder: RemainingSegmentReminder): Cache {
    return {
        cache: new Map(),
        remainingSegmentReminder,
    };
}

// give it some time before requesting missing segments to give the node some time to breathe
const InitialSegmentReminderTimeout = 15000;
// subsequent segments will be limited by the request body size of 400 bytes not being able to contains all segments
// so we can ticker faster here
const SubsequentSegmentReminderTimeout = 2200;

/**
 * Handles incoming segments against the cache.
 * Remove complete segments and adds incomplete ones.
 */
export function incoming(cache: Cache, segment: Segment) {
    // handle invalid segment
    if (segment.totalCount <= 0) {
        return { res: 'error', reason: 'invalid totalCount' };
    }

    // handle single part segment without cache
    if (segment.totalCount === 1) {
        return {
            res: 'complete',
            entry: {
                segments: new Map([[segment.nr, segment]]),
                count: 1,
            },
        };
    }

    // adding to existing segments
    const requestId = segment.requestId;
    const cEntry = cache.cache.get(requestId);
    if (cEntry) {
        const entry = cEntry as Entry;
        // do nothing if already cached
        if (entry.segments.has(segment.nr)) {
            return { res: 'already-cached' };
        }

        // insert segment
        entry.segments.set(segment.nr, segment);
        entry.count++;

        // check if we are completing
        if (segment.totalCount === entry.count) {
            remove(cache, requestId);
            return { res: 'complete', entry };
        }

        scheduleReminder(cache, entry);
        return { res: 'added-to-request', entry };
    }

    // creating new entry
    const entry = {
        requestId,
        segments: new Map([[segment.nr, segment]]),
        count: 1,
    };
    cache.cache.set(requestId, entry);
    scheduleReminder(cache, entry);
    return { res: 'inserted-new' };
}

/**
 * Convert segments **Entry** to message body.
 *
 */
export function toMessage({ segments, count }: Entry) {
    let i = 0;
    let res = '';
    while (i < count) {
        res += (segments.get(i) as Segment).body;
        i++;
    }
    return res;
}

/**
 * Remove everything related to request id.
 *
 */
export function remove({ cache }: Cache, requestId: string) {
    const entry = cache.get(requestId);
    if (entry) {
        clearTimeout(entry.reminder);
        cache.delete(requestId);
    }
}

function scheduleReminder(cache: Cache, entry: Entry) {
    const timeout = entry.reminder
        ? SubsequentSegmentReminderTimeout
        : InitialSegmentReminderTimeout;
    console.log('scheduling reminder with timeout', timeout);
    clearTimeout(entry.reminder);
    entry.reminder = setTimeout(() => remind(cache, entry.requestId), timeout);
}

function remind(cache: Cache, requestId: string) {
    const cEntry = cache.cache.get(requestId);
    if (cEntry) {
        const entry = cEntry as Entry;
        const missing = missingSegmentNrs(entry);
        if (missing.length > 0) {
            clearTimeout(entry.reminder);
            // start with long initial timeout after requesting missing segments
            entry.reminder = undefined;
            scheduleReminder(cache, entry);
            cache.remainingSegmentReminder(entry.requestId, missing);
        }
    }
}

function segmentCount(entry: Entry) {
    for (const [, segment] of entry.segments) {
        return segment.totalCount;
    }
    return 0;
}

function missingSegmentNrs(entry: Entry) {
    const max = segmentCount(entry);
    const missing = [];
    for (let i = 0; i < max; i++) {
        if (!entry.segments.has(i)) {
            missing.push(i);
        }
    }
    return missing;
}
