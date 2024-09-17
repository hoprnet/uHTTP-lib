# GitHub Workflows

This document describes the GitHub workflows used in this project.

## Build

Builds, Lint, Test and publish every commit on a pull request

The published artifact will have the version x.y.z-pr.<PR_NUMBER>+<BUILD_DATE>
The artifact will be published as well in the release channel `next` so it can be used as `@hoprnet/uhttp-lib@next`

## Merge PR

Exclusively publish the closure of a pull request in the alpha release channel so it can be used as `@hoprnet/uhttp-lib@alpha`

The published artifact will have the version x.y.z-pr.<PR_NUMBER>

## Close release

This is a workflow triggered manually from Github Actions [Close Release](https://github.com/hoprnet/uHTTP-lib/actions/workflows/release.yaml). The tasks performed by this workflow include:

-   Publish the version in the latest release channel so it can be used as `@hoprnet/uhttp-lib@latest`
-   Publish the artifact with version x.y.z
-   Published in the internal Google Artifact Registry and in public NPM registry
-   Create a Github release
-   Tag code
-   Add a changelog to the Github release with the list of PR merged during this release
-   Bumps the new version by opening a new PR
-   Sends a Zulip notification
