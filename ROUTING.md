# Routing through uHTTP

```
import { Routing } from '@hoprnet/uhttp-lib';

const clientId = 'xxxx'; // get from [RPCh](https://access.rpch.net)

const router = new Routing.Client(clientId, { forceZeroHop: true });

// replace any fetch call with router.fetch
const resp = await router.fetch("https://foobar.org");
```
