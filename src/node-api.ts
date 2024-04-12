import { api as HoprApi } from '@hoprnet/hopr-sdk';
import type HoprTypes from '@hoprnet/hopr-sdk';
import { DefaultNodeTimeout } from './config';

export type ConnInfo = { apiEndpoint: URL; accessToken: string };

export function connectWebsocket(conn: ConnInfo): WebSocket {
    return HoprApi.websocket({ apiEndpoint: conn.apiEndpoint, apiToken: conn.accessToken });
}

export function sendMessage(
    conn: ConnInfo & { hops?: number; relay?: string },
    { recipient, tag, message }: { recipient: string; tag: number; message: string },
): Promise<string> {
    const addPl = additionalPayload(conn);
    const body = {
        apiEndpoint: conn.apiEndpoint,
        apiToken: conn.accessToken,
        timeout: DefaultNodeTimeout,
        body: message,
        peerId: recipient,
        tag,
        ...addPl,
    };
    return HoprApi.sendMessage(body);
}

function additionalPayload(conn: {
    hops?: number;
    relay?: string;
}): { path: string[] } | { hops: number } {
    if (conn.hops === 0) {
        return { path: [] };
    }
    // default to one hop
    if (conn.relay) {
        return { path: [conn.relay] };
    }
    return { hops: 1 };
}

export function version(conn: ConnInfo) {
    return HoprApi.getVersion({
        apiEndpoint: conn.apiEndpoint,
        apiToken: conn.accessToken,
        timeout: DefaultNodeTimeout,
    });
}

export function retrieveMessages(
    conn: ConnInfo,
    tag: number,
): Promise<HoprTypes.PopAllMessagesResponseType> {
    return HoprApi.popAllMessages({
        apiEndpoint: conn.apiEndpoint,
        apiToken: conn.accessToken,
        timeout: DefaultNodeTimeout,
        tag,
    });
}

export function deleteMessages(conn: ConnInfo, tag: number): Promise<boolean> {
    return HoprApi.deleteMessages({
        apiEndpoint: conn.apiEndpoint,
        apiToken: conn.accessToken,
        timeout: DefaultNodeTimeout,
        tag,
    });
}

export function accountAddresses(conn: ConnInfo) {
    return HoprApi.getAddresses({
        apiEndpoint: conn.apiEndpoint,
        apiToken: conn.accessToken,
        timeout: DefaultNodeTimeout,
    });
}

export function getPeers(conn: ConnInfo): Promise<HoprTypes.GetPeersResponseType> {
    return HoprApi.getPeers({
        apiEndpoint: conn.apiEndpoint,
        apiToken: conn.accessToken,
        timeout: DefaultNodeTimeout,
    });
}

export function getAllChannels(conn: ConnInfo): Promise<HoprTypes.GetChannelsResponseType> {
    return HoprApi.getChannels({
        apiEndpoint: conn.apiEndpoint,
        apiToken: conn.accessToken,
        timeout: DefaultNodeTimeout,
        fullTopology: true,
    });
}

export function getNodeChannels(conn: ConnInfo): Promise<HoprTypes.GetChannelsResponseType> {
    return HoprApi.getChannels({
        apiEndpoint: conn.apiEndpoint,
        apiToken: conn.accessToken,
        timeout: DefaultNodeTimeout,
        fullTopology: false,
    });
}
