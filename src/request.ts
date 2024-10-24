import * as Crypto from '@hoprnet/uhttp-crypto';

import * as Res from './result';
import * as Payload from './payload';
import * as Segment from './segment';
import * as Frame from './frame';
import * as Utils from './utils';

export type Request = {
    id: string; // uuid
    originalId?: string;
    provider: string;
    body?: string;
    entryPeerId: string;
    exitPeerId: string;
    startedAt: number;
    measureLatency: boolean;
    lastSegmentEndedAt?: number;
    headers?: Record<string, string>;
    hops?: number;
    reqRelayPeerId?: string;
    respRelayPeerId?: string;
    chainId?: string;
};

export type CreateOptions = {
    id: string;
    originalId?: string;
    provider: string;
    body?: string;
    clientId: string;
    entryPeerId: string;
    exitPeerId: string;
    exitPublicKey: Uint8Array;
    counterOffset: number;
    measureLatency: boolean;
    headers?: Record<string, string>;
    method?: string;
    hops?: number;
    reqRelayPeerId?: string;
    respRelayPeerId?: string;
    chainId?: string;
    timeout?: number;
};

export type UnboxRequest = {
    reqPayload: Payload.ReqPayload;
    session: Crypto.Session;
};

/**
 * Creates a request and compresses its payload.
 */
export function create({
    id,
    originalId,
    provider,
    body,
    clientId,
    entryPeerId,
    exitPeerId,
    exitPublicKey,
    counterOffset,
    measureLatency,
    headers,
    method,
    hops,
    reqRelayPeerId,
    respRelayPeerId,
    chainId,
    timeout,
}: CreateOptions): Res.Result<{ request: Request; session: Crypto.Session }> {
    const payload: Payload.ReqPayload = {
        endpoint: provider,
        clientId,
        body,
        headers,
        method,
        hops,
        relayPeerId: respRelayPeerId,
        withDuration: measureLatency,
        chainId,
        timeout,
    };

    const resEncode = Payload.encodeReq(payload);
    if (Res.isErr(resEncode)) {
        return resEncode;
    }

    const json = JSON.stringify(resEncode.res);
    const data = Utils.stringToBytes(json);

    const params = {
        message: data,
        exitPeerId,
        uuid: id,
        exitPublicKey,
        counterOffset,
    };
    const resBox = Crypto.boxRequest(params);
    if (Crypto.isError(resBox)) {
        return Res.err(resBox.error);
    }

    return Res.ok({
        request: {
            id,
            originalId,
            provider,
            body,
            entryPeerId,
            exitPeerId,
            exitPublicKey,
            headers,
            hops,
            measureLatency,
            reqRelayPeerId,
            respRelayPeerId,
            startedAt: performance.now(),
        },
        session: resBox.session,
    });
}

export function messageToReq({
    message,
    requestId,
    exitPeerId,
    exitPrivateKey,
}: {
    requestId: string;
    message: Uint8Array;
    exitPeerId: string;
    exitPrivateKey: Uint8Array;
}): Res.Result<UnboxRequest> {
    const params = {
        message,
        uuid: requestId,
        exitPeerId,
        exitPrivateKey,
    };
    const resUnbox = Crypto.unboxRequest(params);
    if (Crypto.isError(resUnbox)) {
        return Res.err(resUnbox.error);
    }

    if (!resUnbox.session.request) {
        return Res.err('Crypto session without request object');
    }
    const msg = Utils.bytesToString(resUnbox.session.request);
    try {
        const transPayload = JSON.parse(msg);
        const resReqPld = Payload.decodeReq(transPayload);
        if (Res.isErr(resReqPld)) {
            return resReqPld;
        }
        const reqPayload = resReqPld.res;
        return Res.ok({
            reqPayload,
            session: resUnbox.session,
        });
    } catch (ex: any) {
        return Res.err(`Error during JSON parsing: ${ex.toString()}`);
    }
}

/**
 * Convert request to segments.
 */
export function toSegments(req: Request, session: Crypto.Session): Segment.Segment[] {
    // we need the entry id ouside of of the actual encrypted payload
    const reqData = session.request as Uint8Array;
    const pIdBytes = Utils.stringToBytes(req.entryPeerId);
    const body = Utils.concatBytes(pIdBytes, reqData);
    return Segment.toSegments(req.id, body);
}

/**
 * Convert request to byte frames usable for websocket piping.
 */
export function toFrames(req: Request, session: Crypto.Session): Res.Result<Frame.Frame[]> {
    // we need the entry id ouside of of the actual encrypted payload
    const reqData = session.request as Uint8Array;
    return Frame.toRequestFrames(req.entryPeerId, req.id, reqData);
}

/**
 * Pretty print request in human readable form.
 */
export function prettyPrint(req: Request) {
    const eId = Utils.shortPeerId(req.entryPeerId);
    const xId = Utils.shortPeerId(req.exitPeerId);
    const path = [`e${eId}`];
    if (req.reqRelayPeerId) {
        path.push(`r${Utils.shortPeerId(req.reqRelayPeerId)}`);
    } else if (req.hops !== 0) {
        path.push('(r)');
    }
    path.push(`x${xId}`);
    if (req.respRelayPeerId) {
        path.push(`r${Utils.shortPeerId(req.respRelayPeerId)}`);
    }
    const id = req.id;
    const prov = req.provider;
    return `request[${id}, ${path.join('>')}, ${prov}]`;
}
