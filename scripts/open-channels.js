#!/usr/bin/env node
const { api } = require('@hoprnet/hopr-sdk');

const apiEndpoints = process.env.HOPRD_ENDPOINTS;
const apiToken = process.env.HOPRD_ACCESS_TOKEN;

if (!apiEndpoints) {
    throw new Error("Missing 'HOPRD_ENDPOINTS' env var");
}
if (!apiToken) {
    throw new Error("Missing 'HOPRD_ACCESS_TOKEN' env var");
}

const payload = { apiEndpoint, apiToken };

async function getAddresses(apiEndpoint) {
    const addresses = await api.getAddresses({ apiEndpoint, apiToken });
    return addresses;
}

async function run() {
    const pAddresses = apiEndpoints.map(getAddresses);
}

run();
