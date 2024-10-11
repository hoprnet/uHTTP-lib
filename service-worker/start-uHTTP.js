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
        console.log("message", event.data.message)
        if (!appended && event.data.message === "uHTTP-is-ready") {
            console.log("uHTTP Ready");
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
    if (!('serviceWorker' in navigator)) throw new Error('serviceWorker not supported');

    //  const url = (new URL(`/http/script/_sw.js?hash=${swhash}`, location)).toString();
    const url = `${window.location.protocol}//${window.location.host}/service-worker.js?uClientId=${uClientId}&uForceZeroHop=${uForceZeroHop}&discoveryPlatformEndpoint=${encodeURI(discoveryPlatformEndpoint)}&uHTTPVersion=${uHTTPVersion}`;

    console.info('Registering worker');
    const registration = await navigator.serviceWorker.register(url, {
        type: 'module',
        scope: '/',
    });

    const registeredWorker = registration.active || registration.waiting || registration.installing;
    console.info('Registered worker:', registeredWorker);
    if (registeredWorker?.scriptURL != url) {
        console.log('[ServiceWorker] Old URL:', registeredWorker?.scriptURL || 'none', 'updating to:', url);
        await registration.update();
        console.info('Updated worker');
    }

    console.info('Waiting for ready worker');
    let serviceReg = await navigator.serviceWorker.ready;
    console.info('Ready registration:', serviceReg);
    //


    // We do not need it to be a controller if it is set in the correct place (scope: '/')
    /*
    await new Promise(r => setTimeout(r, 1_000));
    if (!navigator.serviceWorker.controller) {
        console.info('Worker isn’t controlling, re-register');
        try {
            const reg = await navigator.serviceWorker.getRegistration('/');
            console.info('Unregistering worker');
            await reg.unregister();
            console.info('Successfully unregistered, trying registration again');
        //    await new Promise(r => setTimeout(r, 10_000));
            return registerServiceWorker();
        } catch (err) {
            console.error(`ServiceWorker failed to re-register after hard-refresh, reloading the page!`, err);
            return location.reload();
        }
    }
    */


    let serviceWorker = serviceReg.active || serviceReg.waiting || serviceReg.installing;
    if (!serviceWorker) {
        console.info('No worker on registration, getting registration again');
        serviceReg = await navigator.serviceWorker.getRegistration('/');
        serviceWorker = serviceReg.active || serviceReg.waiting || serviceReg.installing;
    }

    if (!serviceWorker) {
        console.info('No worker on registration, waiting 50ms');
        await sleep(50); // adjustable or skippable, have a play around
    }

    serviceWorker = serviceReg.active || serviceReg.waiting || serviceReg.installing;
    if (!serviceWorker) throw new Error('after waiting on .ready, still no worker');

    if (serviceWorker.state == 'redundant') {
        console.info('Worker is redundant, trying again');
        //    await new Promise(r => setTimeout(r, 10_000));
        return registerServiceWorker();
    }

    if (serviceWorker.state != 'activated') {
        console.info('Worker IS controlling, but not active yet, waiting on event. state=', serviceWorker.state);
        try {
            // timeout is adjustable, but you do want one in case the statechange
            // doesn't fire / with the wrong state because it gets queued,
            // see ServiceWorker.onstatechange MDN docs.
            await timeout(100, new Promise((resolve) => {
                serviceWorker.addEventListener('statechange', (e) => {
                    if (e.target.state == 'activated') resolve();
                });
            }));
        } catch (err) {
            if (err instanceof TimeoutError) {
                if (serviceWorker.state != 'activated') {
                    if (tryOnce) {
                        console.info('Worker is still not active. state=', serviceWorker.state);
                        throw new Error('failed to activate service worker');
                    } else {
                        console.info('Worker is still not active, retrying once');
                        //    await new Promise(r => setTimeout(r, 10_000));
                        return registerServiceWorker(true);
                    }
                }
            } else {
                // should be unreachable
                throw err;
            }
        }
    }

    console.info('Worker is active, we’re good folks!');
    //   console.info('Worker is controlling and active, we’re good folks!');
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




