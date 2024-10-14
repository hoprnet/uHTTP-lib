const uClientId = 'REPLACE_uClientId';
const uForceZeroHop = REPLACE_uForceZeroHop;
const discoveryPlatformEndpoint = 'REPLACE_discoveryPlatformEndpoint';
const uHTTPVersion = 'REPLACE_uHTTPVersion';
const broadcastChannel = new BroadcastChannel("sw-uhttp");

let appended = false;


checkIfuHTTPIsReady();
registerServiceWorker();

async function checkIfuHTTPIsReady() {
    broadcastChannel.addEventListener("message", function eventListener(event) {
        if (!appended && event.data.message === "uHTTP-is-ready") {
            console.log("[uHTTP] uHTTP is ready. Appending page now to index.html");
            appendPage();
            appended = true;
        }
    })

    while (!appended) {
        broadcastChannel.postMessage({ message: "uHTTP-ready?" })
        await new Promise(r => setTimeout(r, 1_000));
    }
}


async function registerServiceWorker(tryOnce = false) {
    if (!('serviceWorker' in navigator)) {
        const errorMessage = document.createElement("div");
        const content = document.createTextNode("Service worker is not supported on this browser. Unable to load the website.");
        errorMessage.appendChild(content);
        document.querySelector('body').append(errorMessage);
        throw new Error('Service worker not supported');
    }

    const url = `${window.location.protocol}//${window.location.host}/service-worker.js?uClientId=${encodeURI(uClientId)}&uForceZeroHop=${uForceZeroHop}&discoveryPlatformEndpoint=${encodeURI(discoveryPlatformEndpoint)}&uHTTPVersion=${encodeURI(uHTTPVersion)}`;

    console.info('Registering worker');
    const registration = await navigator.serviceWorker.register(url, {
        type: 'module',
        scope: '/',
    });

    const registeredWorker = registration.active || registration.waiting || registration.installing;
    console.info('[uHTTP] Service worker is registered.', registeredWorker);
    if (registeredWorker?.scriptURL != url) {
        await registration.update();
        console.log(`[uHTTP] uHTTP service worker is updated now.`);
    }

    let serviceReg = await navigator.serviceWorker.ready;
    console.info('[uHTTP] Service worker is ready.', serviceReg);

    // We do not need it to be a controller if it is set in the correct place (scope: '/')
    /*
    await new Promise(r => setTimeout(r, 4_000));
    if (!navigator.serviceWorker.controller) {
        console.info('[uHTTP] Worker isn’t controlling, re-register');
        try {
            const reg = await navigator.serviceWorker.getRegistration('/');
            console.info('[uHTTP] Unregistering worker');
            await reg.unregister();
            console.info('[uHTTP] Successfully unregistered, trying registration again');
        //    await new Promise(r => setTimeout(r, 10_000));
            return registerServiceWorker();
        } catch (err) {
            console.error(`[uHTTP] ServiceWorker failed to re-register after hard-refresh, reloading the page!`, err);
            return location.reload();
        }
    }
    */


    let serviceWorker = serviceReg.active || serviceReg.waiting || serviceReg.installing;
    if (!serviceWorker) {
        console.info('[uHTTP] No service worker on registration, getting registration again');
        serviceReg = await navigator.serviceWorker.getRegistration('/');
        serviceWorker = serviceReg.active || serviceReg.waiting || serviceReg.installing;
    }

    if (!serviceWorker) {
        console.info('[uHTTP] No service worker on registration, waiting 50ms');
        await sleep(100); // adjustable or skippable, have a play around
    }

    serviceWorker = serviceReg.active || serviceReg.waiting || serviceReg.installing;
    if (!serviceWorker) throw new Error('[uHTTP] After waiting on .ready, still no worker');

    if (serviceWorker.state == 'redundant') {
        console.info('[uHTTP] Service worker is redundant, trying again');
        return registerServiceWorker();
    }

    if (serviceWorker.state != 'activated') {
        console.info('[uHTTP] Service worker is controlling, but not active yet, waiting on event. State =', serviceWorker.state);
        try {
            // timeout is adjustable, but you do want one in case the statechange, 1s seems to do the job well
            // doesn't fire / with the wrong state because it gets queued,
            // see ServiceWorker.onstatechange MDN docs.
            await timeout(1000, new Promise((resolve) => {
                serviceWorker.addEventListener('statechange', (e) => {
                    if (e.target.state == 'activated') resolve();
                });
            }));
        } catch (err) {
            if (err instanceof TimeoutError) {
                if (serviceWorker.state != 'activated') {
                    if (tryOnce) {
                        console.info('[uHTTP] Worker is still not active after 1s. state =', serviceWorker.state);
                        throw new Error('failed to activate service worker');
                    } else {
                        console.info('[uHTTP] Worker is still not active after 1s, retrying once');
                        return registerServiceWorker(true);
                    }
                }
            } else {
                // should be unreachable
                throw err;
            }
        }
    }

    console.info('[uHTTP] Sercice worker is controlling and active');
    return serviceWorker;

}

export class TimeoutError extends Error { }

/**
 * Run promise but reject after some timeout.
 *
 * @template T
 * @param {number} ms Milliseconds until timing out
 * @param {Promise<T>} promise Promise to run until timeout (note that it will keep running after timeout)
 * @returns {Promise<T, Error>}
 */
export function timeout(ms, promise) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new TimeoutError);
        }, ms);

        promise.then((result) => {
            clearTimeout(timer);
            resolve(result);
        }, (error) => {
            clearTimeout(timer);
            reject(error);
        });
    })
}


