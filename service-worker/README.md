## Installation

```
yarn add @hoprnet/uhttp-lib
```

or

```
npm i @hoprnet/uhttp-lib
```

The package has to be added to main dependencies and not the devDependencies.

Add "uhttp-post-build-react" to your build process right after the build is finished:

eg:

```
  "scripts": {
    "build": "tsc && vite build",
    "build:uHTTP": "tsc && vite build && uhttp-post-build-react",
  }
```

## Environment Configuration

Create a `.env` file in your project root. Ensure this file is listed in your `.gitignore` to prevent committing sensitive values.

```dotenv
# Required - Keep this secure and never commit to version control
uClientId=YOUR_CLIENT_ID

# Optional - Network Configuration
uForceZeroHop=true
discoveryPlatformEndpoint=https://discovery-platform.hoprnet.link

# Optional - Build Configuration
buildFolderPath=./special-build-path-if-not-default  #default is ./build
```