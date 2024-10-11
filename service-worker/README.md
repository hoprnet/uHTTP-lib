Add `node ./scripts/post-build-uHTTP.js" to your build process right after the build is finished:

eg:

```
  "scripts": {
    "build": "tsc && vite build",
    "build:uHTTP": "tsc && vite build && node ./scripts/post-build-uHTTP.js",
  }
```


.env:

```
uClientId = XXXX
uForceZeroHop = true
discoveryPlatformEndpoint = https://discovery-platform.hoprnet.link
```