import { Routing } from '/uHTTP/uhttp-lib.min.mjs';
let uClient;
const broadcastChannel = new BroadcastChannel("sw-uhttp");

const installEvent = () => {
    self.addEventListener('install', (event) => {
        console.log('[uHTTP SW] Install event');
        event.waitUntil(self.skipWaiting()); // Activate worker immediately
    });
};
installEvent();

const activateEvent = () => {
    self.addEventListener('activate', async (event) => {
        console.log('[uHTTP SW] Activate event');
        event.waitUntil(self.clients.claim()); // Become available to all pages
        const params = new URLSearchParams(self.location.search);
        const uClientId = params.get('uClientId');
        const forceZeroHop = params.get('uForceZeroHop') === 'true';
        const discoveryPlatformEndpoint = params.get('discoveryPlatformEndpoint');
        uClient = new Routing.Client(uClientId, {
            forceZeroHop,
            discoveryPlatformEndpoint,
            timeout: 60_000,
        });
        const isReady = await uClient.isReady(60_000);
        console.log(`[uHTTP SW] Service worker activated. uHTTP is ${isReady ? 'ready' : 'NOT ready'}`);
        if(isReady) {
            broadcastChannel.postMessage({ message: "uHTTP-is-ready" })
        } else {
            window.location.reload();
        }
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
    if(!uClient) console.warn('[SW] uHTTP is undefined');
    if(event.data.message === "uHTTP-ready?" && uClient) {
        const isReady = await uClient.isReady(10_000);
        if(isReady) {
            broadcastChannel.postMessage({ message: "uHTTP-is-ready" })
        }
    }
})