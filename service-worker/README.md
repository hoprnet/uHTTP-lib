Add `node ./node_modules/@hoprnet/uhttp-lib/service-worker/post-build-uHTTP.js" to your build process right after the build is finished:

eg:

```
  "scripts": {
    "build": "tsc && vite build",
    "build:uHTTP": "tsc && vite build && node ./node_modules/@hoprnet/uhttp-lib/service-worker/post-build-uHTTP.js",
  }
```


.env:

```
uClientId = XXXX
uForceZeroHop = true
discoveryPlatformEndpoint = https://discovery-platform.hoprnet.link
```