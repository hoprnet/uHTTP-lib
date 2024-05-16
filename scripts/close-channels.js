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

function printElapsed(elMs) {
    const seconds = Math.round(elMs / 1000);
    if (seconds > 60) {
        const minutes = Math.floor(seconds / 60);
        const remSec = seconds % 60;
        return `${minutes}m${remSec}s`;
    }
    return `${seconds}s`;
}

function printChannel(ch) {
    return `Channel[${ch.id},${ch.status},${ch.peerAddress}]`;
}

async function closeChannel(channel) {
    const started = Date.now();

    let ongoingTicker = setInterval(() => {
        const now = Date.now();
        const elapsed = now - started;
        console.log(
            `Still waiting on closure response since ${printElapsed(elapsed)} for channel ${printChannel(channel)}`,
        );
    }, 30e3);

    try {
        const res = await api.closeChannel({ channelId: channel.id, ...lastingPayload });
        const now = Date.now();
        const elapsed = now - started;
        console.log(
            `Moved ${printChannel(channel)} to ${res.channelStatus} after ${printElapsed(elapsed)}`,
        );
        return res.receipt;
    } catch (err) {
        console.error(`Error closing ${printChannel(channel)}:`, err);
        throw err;
    } finally {
        clearInterval(ongoingTicker);
    }
}

async function run() {
    const channels = await api.getChannels(payload);
    const outgoingOpen = channels.outgoing.filter(({ status }) => status === 'Open');
    if (outgoingOpen.length > 0) {
        console.log(`closing ${outgoingOpen.length} outgoing channels`);
        const resMapping = outgoingOpen.map((ch) => ({ ch, pRes: closeChannel(ch) }));
        const pRes = resMapping.map(({ pRes }) => pRes);
        await Promise.all(pRes);
        console.log('Closed all channels with receipts:');
        resMapping.forEach(async ({ ch, pRes }) => {
            const receipt = await pRes;
            console.log(`${printChannel(ch)}: ${receipt}`);
        });
    } else {
        console.log('no outgoing open channels found');
        channels.outgoing.forEach((ch) => {
            console.log(`found outgoing ${printChannel(ch)}`);
        });
    }
}

run();
