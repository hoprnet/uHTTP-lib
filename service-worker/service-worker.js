import { Routing } from '/uHTTP/uhttp-lib.min.mjs';
let uClient;
const broadcastChannel = new BroadcastChannel("sw-uhttp");

const installEvent = () => {
    self.addEventListener('install', (event) => {
        console.log('install');
        //    event.waitUntil(self.skipWaiting()); // Activate worker immediately
    });
};
installEvent();

const activateEvent = () => {
    self.addEventListener('activate', async (event) => {
        console.log('activate');
    //    event.waitUntil(self.clients.claim()); // Become available to all pages
        const params = new URLSearchParams(self.location.search);
        const uClientId = params.get('uClientId');
        const forceZeroHop = params.get('uForceZeroHop');
        const discoveryPlatformEndpoint = params.get('discoveryPlatformEndpoint');
        uClient = new Routing.Client(uClientId, {
            forceZeroHop,
            discoveryPlatformEndpoint,
            timeout: 10000,
        });
        const isReady = await uClient.isReady(60_000);
        console.log('uHTTP isReady', isReady);
        if(isReady) {
            broadcastChannel.postMessage({ message: "uHTTP-is-ready" })
        } else {
            console.error('Something is wrong, reloading the page');
            window.location.reload();
        }
        console.log('service worker activated');
    });
};
activateEvent();

const fetchEvent = () => {
    self.addEventListener('fetch', (e) => {
        const logLine = reqLog(e.request);
        const url = new URL(e.request.url);
        // only uhttp requests to 3rd party
        if (url.origin !== self.location.origin) {
            const chain = uClient
                .fetch(e.request)
                .then((res) => {
                    console.log(`uHTTP response to ${logLine}:`, res);
                    return res;
                })
                .catch((ex) => {
                    console.log(`uHTTP error to ${logLine}`, ex);
                    // fallback to default fetch
                    return fetch(e.request).then((res) => res);
                });
            e.respondWith(chain);
        } else {
            const chain = fetch(e.request).then((res) => res);
            e.respondWith(chain);
        }
    });
};

function reqLog(request) {
    const headers = [];
    request.headers.forEach((val, k) => headers.push(`${k}:${val}`));
    const extra = [request.method];
    if (headers.length > 0) {
        extra.push(headers.join(';'));
    }
    if (request.body && request.body.length > 0) {
        extra.push(request.body);
    }
    return `${request.url}[${extra.join('|')}]`;
}

fetchEvent();


broadcastChannel.addEventListener("message", async function eventListener(event) {
    if(event.data.message === "uHTTP-ready?" && uClient) {
        const isReady = await uClient.isReady(10_000);
        console.log('uHTTP isReady', isReady);
        if(isReady) {
            broadcastChannel.postMessage({ message: "uHTTP-is-ready" })
        }
    }
})