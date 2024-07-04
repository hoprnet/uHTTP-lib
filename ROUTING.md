# Routing through uHTTP

We offer a fetch-equivalent API endpoint which you can use as a drop-in replacement for fetch.
This has some limitations, though.

Compared to the [original](https://developer.mozilla.org/en-US/docs/Web/API/fetch) it has the following limitations:

-   can only handle string or stringifiable input
-   can only handle these request options: `body`, `headers` and `method`
-   has one additional option paramater called `timeout` [in ms], which can cover timeout based `signal` functionality.

```javascript
import { Routing } from '@hoprnet/uhttp-lib';

const clientId = 'xxxx'; // get from [RPCh](https://access.rpch.net)

const router = new Routing.Client(clientId, { forceZeroHop: true });

// replace any fetch call with router.fetch
const resp = await router.fetch('https://foobar.org');
```
