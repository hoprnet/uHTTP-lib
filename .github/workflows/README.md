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

This is a workflow triggered manually from Github Actions [Close Release](https://github.com/hoprnet/uHTTP-lib/actions/workflows/release.yaml) 

Closes the release by publish the version in the latest release channel so it can be used as `@hoprnet/uhttp-lib@latest`

The published artifact will have the version x.y.z

The artifact is published in the internal Google Artifact Registry and in public NPM registry

A github release is created and code is tagged automatically.

A changelog is automatically added to the github release with the list of PR merged into this released