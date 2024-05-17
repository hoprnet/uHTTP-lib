# Convenience scripts

## Close channels

Execute this script to close all incoming and all outgoing channels on a node.

Usage:

```
HOPRD_ENDPOINT=<node_url> HOPRD_ACCESS_TOKEN=<node_api_token> node close-channels.js
```

## Open channels

Execute this script to create outgoing channels between all given nodes.

Usage:

```
HOPRD_ENDPOINTS=<node_url1>,<node_url2>,... HOPRD_ACCESS_TOKEN=<node_api_token> node open-channels.js
```
