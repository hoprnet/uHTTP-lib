#!/usr/bin/env node
const { api } = require('@hoprnet/hopr-sdk');

const rawApiEndpoints = process.env.HOPRD_ENDPOINTS;
const apiToken = process.env.HOPRD_ACCESS_TOKEN;

if (!rawApiEndpoints) {
    throw new Error("Missing 'HOPRD_ENDPOINTS' env var");
}
if (!apiToken) {
    throw new Error("Missing 'HOPRD_ACCESS_TOKEN' env var");
}

const channelFunding = 1e3; // 1e6;
const apiEndpoints = rawApiEndpoints.split(',');

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
    return await api.openChannel({
        apiEndpoint: from.apiEndpoint,
        apiToken,
        amount: channelFunding,
        peerAddress: to.native,
    });
}

async function run() {
    const pAddresses = apiEndpoints.map(getAddresses);
    const addresses = await Promise.all(pAddresses);
    const paths = routes(addresses);
    console.log(`opening ${paths.length} channels on ${addresses.length} nodes`);
    const pRes = paths.map(openChannel);
    const results = await Promise.all(results);
}

run();
