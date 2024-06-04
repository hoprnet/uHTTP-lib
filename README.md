# u(nlinked)HTTP-lib

Provides common functionality shared across uHTTP applications and modules.

## Using uHTTP network

If you want to send traffic through uHTTP network, take a look at [Routing](ROUTING.md).

## Deployment

### Staging

-   staging can be deployed from main
-   run `yarn changeset version` to create the current changelog
-   run `yarn build` to update version info
-   commit everything, create a matching tag and push to main
-   run publish action with `beta`(default) tag

### Production

-   production must be deployed from main
-   should come after a successful staging publishing
-   run publish action with `latest` tag
