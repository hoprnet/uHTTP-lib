import * as Crypto from '@hoprnet/phttp-crypto';

import * as Payload from './payload';
import * as Request from './request';
import * as Res from './result';
import * as Utils from './utils';

/**
 * Stats alongside Response.
 * segDur - duration of first segment http call started until last segment http call finished.
 * rpcDur - duration of RPC request from exit node
 * exitNodeDur - approximate execution duration up to encrypting and compressing response itself
 * hoprDur - estimated duration of segments during request - response cycle inside hopr network
 */
export type Stats =
    | {
          segDur: number;
          rpcDur: number;
          exitNodeDur: number;
          hoprDur: number;
      }
    | { segDur: number };

export type Response = {
    status: number;
    stats?: Stats;
    text: () => Promise<string>;
    json: () => Promise<object>;
};

export class SendError extends Error {
    constructor(
        message: string,
        public readonly provider: string,
        public readonly reqHeaders: Record<string, string>,
    ) {
        super(message);
        this.name = 'SendError';
    }
}

export type UnboxResponse = {
    resp: Payload.RespPayload;
    session: Crypto.Session;
};

export function respToMessage({
    requestId,
    entryPeerId,
    respPayload,
    unboxSession,
}: {
    requestId: string;
    entryPeerId: string;
    respPayload: Payload.RespPayload;
    unboxSession: Crypto.Session;
}): Res.Result<Uint8Array> {
    // TODO
    // const resEncode = Payload.encodeResp(respPayload);
    // if (Res.isErr(resEncode)) {
    // return resEncode;
    // }

    const dataJSON = JSON.stringify(respPayload);
    const data = Utils.stringToBytes(dataJSON);
    const resBox = Crypto.boxResponse(unboxSession, {
        uuid: requestId,
        entryPeerId,
        message: data,
    });
    if (Crypto.isError(resBox)) {
        return Res.err(resBox.error);
    }

    if (!resBox.session.response) {
        return Res.err('Crypto session without response object');
    }

    return Res.ok(resBox.session.response);
}

export function messageToResp({
    respData,
    request,
    session,
}: {
    respData: Uint8Array;
    request: Request.Request;
    session: Crypto.Session;
}): Res.Result<UnboxResponse> {
    const resUnbox = Crypto.unboxResponse(session, {
        uuid: request.id,
        message: respData,
        entryPeerId: request.entryPeerId,
    });
    if (Crypto.isError(resUnbox)) {
        return Res.err(resUnbox.error);
    }

    if (!resUnbox.session.response) {
        return Res.err('Crypto session without response object');
    }

    const msg = Utils.bytesToString(resUnbox.session.response);
    try {
        const resp = JSON.parse(msg);
        return Res.ok({
            resp,
            session: resUnbox.session,
        });
    } catch (ex: any) {
        return Res.err(`Error during JSON parsing: ${ex.toString()}`);
    }
}
