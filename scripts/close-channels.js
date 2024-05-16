#!/usr/bin/env node
const { flows } = require('@hoprnet/hopr-sdk');

const apiEndpoint = process.env.HOPRD_ENDPOINT;
const apiToken = process.env.HOPRD_ACCESS_TOKEN;

if (!apiEndpoint) {
    throw new Error("Missing 'HOPRD_ENDPOINT' env var");
}
if (!apiToken) {
    throw new Error("Missing 'HOPRD_ACCESS_TOKEN' env var");
}

async function run() {
    console.log(`closing all channels for ${apiEndpoint}`);
    const res = await flows.closeAllChannels({ apiEndpoint, apiToken });
    console.log('results: ', res);
}

run();
