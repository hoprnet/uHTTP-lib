import { Routing } from '/uHTTP/uhttp-lib.min.mjs';
let uClient;
const broadcastChannel = new BroadcastChannel('sw-uhttp');

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
        console.log(
            `[uHTTP SW] Service worker activated. uHTTP is ${isReady ? 'ready' : 'NOT ready'}`,
        );
        if (isReady) {
            broadcastChannel.postMessage({ message: 'uHTTP-is-ready' });
        } else {
            self.clients.matchAll({ type: 'window' }).then((clients) => {
                clients.forEach((client) => client.navigate(client.url));
            });
        }
    });
};
activateEvent();

const fetchEvent = () => {
    self.addEventListener('fetch', (e) => {
        const logLine = reqLog(e.request);
        const reqUrl = new URL(e.request.url);
        const reqHostname = reqUrl.hostname;

        if (isHostnamePublic(reqHostname)) {
            console.info(`[uHTTP] Request to ${reqHostname} is using uHTTP`);
            const chain = uClient
                .fetch(e.request)
                .then((res) => {
                    return res;
                })
                .catch((error) => {
                    console.error(`[uHTTP] Error to ${logLine}`, error);
                    return new Response(
                        `uHTTP Error: Service unavailable for this request. ${error}`,
                        { status: 503 },
                    );
                });
            e.respondWith(chain);
        } else {
            console.warn(
                `[uHTTP] Request to ${reqHostname} is NOT routed through uHTTP as it goes to privte IP range`,
            );
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

function isHostnamePublic(hostname) {
    let isPublic = true;
    if (/^(10)\.(.*)\.(.*)\.(.*)$/.test(hostname)) {
        // 10.x.x.x
        isPublic = false;
    } else if (/^(172)\.(1[6-9]|2[0-9]|3[0-1])\.(.*)\.(.*)$/.test(hostname)) {
        // 172.16.x.x - 172.31.255.255
        isPublic = false;
    } else if (/^(192)\.(168)\.(.*)\.(.*)$/.test(hostname)) {
        // 192.168.x.x
        isPublic = false;
    } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
        // localhost
        isPublic = false;
    }
    return isPublic;
}

fetchEvent();

broadcastChannel.addEventListener('message', async function eventListener(event) {
    if (!uClient) console.warn('[SW] uHTTP is undefined');
    if (event.data.message === 'uHTTP-ready?' && uClient) {
        const isReady = await uClient.isReady(10_000);
        if (isReady) {
            broadcastChannel.postMessage({ message: 'uHTTP-is-ready' });
        }
    }
});
