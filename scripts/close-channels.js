#!/usr/bin/env node
const { api } = require('@hoprnet/hopr-sdk');

const apiEndpoint = process.env.HOPRD_ENDPOINT;
const apiToken = process.env.HOPRD_ACCESS_TOKEN;
const timeout = 10 * 60e3;

if (!apiEndpoint) {
    throw new Error("Missing 'HOPRD_ENDPOINT' env var");
}
if (!apiToken) {
    throw new Error("Missing 'HOPRD_ACCESS_TOKEN' env var");
}

const payload = { apiEndpoint, apiToken };
const lastingPayload = { timeout, ...payload };

function formatElapsed(elMs) {
    const seconds = Math.round(elMs / 1000);
    if (seconds > 60) {
        const minutes = Math.floor(seconds / 60);
        const remSec = seconds % 60;
        return `${minutes}m${remSec}s`;
    }
    return `${seconds}s`;
}

async function closeChannel(channel) {
    const sChannel = `Channel[${channel.id},${channel.status},${channel.peerAddress}]`;
    const started = Date.now();
    let t = setInterval(() => {
        const now = Date.now();
        const elapsed = now - started;
        console.log(
            `Still waiting on closure response since ${formatElapsed(elapsed)} for channel ${sChannel}`,
        );
    }, 30e3);
    try {
        const res = await api.closeChannel({ channelId: channel.id, ...lastingPayload });
        const now = Date.now();
        const elapsed = now - started;
        console.log(`Moved ${sChannel} to ${res.channelStatus} after ${formatElapsed(elapsed)}`);
        return { id: channel.id, receipt: res.receipt };
    } catch (err) {
        console.error(
            `Error closing channel[${channel.id},${channel.status},${channel.peerAddress}]:`,
            err,
        );
        throw err;
    } finally {
        clearInterval(t);
    }
}

async function run() {
    const channels = await api.getChannels(payload);
    const outgoingOpen = channels.outgoing.filter(({ status }) => status === 'Open');
    if (outgoingOpen.length > 0) {
        console.log(`closing ${outgoingOpen.length} outgoing channels`);
        const pRes = outgoingOpen.map(closeChannel);
        console.log(await Promise.all(pRes));
    }
}

run();
