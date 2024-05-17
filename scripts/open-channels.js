#!/usr/bin/env node
const { api } = require('@hoprnet/hopr-sdk');

const rawApiEndpoints = process.env.HOPRD_ENDPOINTS;
const apiToken = process.env.HOPRD_ACCESS_TOKEN;
const timeout = 10 * 60e3;

if (!rawApiEndpoints) {
    throw new Error("Missing 'HOPRD_ENDPOINTS' env var");
}
if (!apiToken) {
    throw new Error("Missing 'HOPRD_ACCESS_TOKEN' env var");
}

const channelFunding = 1e6;
const apiEndpoints = rawApiEndpoints.split(',');

function printElapsed(elMs) {
    const seconds = Math.round(elMs / 1000);
    if (seconds > 60) {
        const minutes = Math.floor(seconds / 60);
        const remSec = seconds % 60;
        return `${minutes}m${remSec}s`;
    }
    return `${seconds}s`;
}

async function getAddresses(apiEndpoint) {
    const res = await api.getAddresses({ apiEndpoint, apiToken });
    return { apiEndpoint, ...res };
}

function routes(addresses) {
    return addresses.reduce((acc, origin) => {
        const targets = addresses.filter(({ hopr }) => origin.hopr !== hopr);
        const tRoutes = targets.map((target) => ({ from: origin, to: target }));
        return acc.concat(tRoutes);
    }, []);
}

async function openChannel({ from, to }) {
    const started = Date.now();

    let ongoingTicker = setInterval(() => {
        const now = Date.now();
        const elapsed = now - started;
        console.log(
            `Waiting on opening response since ${printElapsed(elapsed)} for channel ${from.hopr} -> ${to.hopr}`,
        );
    }, 30e3);

    try {
        const res = await api.openChannel({
            apiEndpoint: from.apiEndpoint,
            apiToken,
            amount: `${channelFunding}`,
            peerAddress: to.native,
            timeout,
        });
        const now = Date.now();
        const elapsed = now - started;
        console.log(
            `Opened channel from ${from.hopr} to ${to.hopr} after ${printElapsed(elapsed)}`,
        );
        return { from, to, res };
    } catch (err) {
        if (err.status === 'CHANNEL_ALREADY_OPEN') {
            return { from, to, res: 'already open' };
        }
        throw err;
    } finally {
        clearInterval(ongoingTicker);
    }
}

async function run() {
    const pAddresses = apiEndpoints.map(getAddresses);
    const addresses = await Promise.all(pAddresses);
    const paths = routes(addresses);
    console.log(`Checking ${paths.length} channels on ${addresses.length} nodes`);
    const pRes = paths.map(openChannel);
    const results = await Promise.all(pRes);
    results.forEach(({ from, to, res }) => {
        if ('transactionReceipt' in res) {
            console.log(`Opened channel ${from.hopr} -> ${to.hopr}: ${res.transactionReceipt}`);
        } else {
            console.log(`Checked channel ${from.hopr} -> ${to.hopr}: ${res}`);
        }
    });
}

run();
