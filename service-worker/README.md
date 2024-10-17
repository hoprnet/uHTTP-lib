Installation

```
yarn add @hoprnet/uhttp-lib
```

or

```
npm i @hoprnet/uhttp-lib
```

The package has to be added to main dependencies and not the devDependencies.

Add `uhttp-post-build-react" to your build process right after the build is finished:

eg:

```
  "scripts": {
    "build": "tsc && vite build",
    "build:uHTTP": "tsc && vite build && uhttp-post-build-react",
  }
```

.env:

```
uClientId = XXXX
uForceZeroHop = true
discoveryPlatformEndpoint = https://discovery-platform.hoprnet.link
buildFolderPath = ./build/cowswap #default is ./build
```
