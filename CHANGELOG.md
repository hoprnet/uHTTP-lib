# @hoprnet/uhttp-lib

## 3.1.3

### Patch Changes

-   64786ed: Fix relay node compatible version finding
-   64786ed: Fix logging output namespaces

## 3.1.2

### Patch Changes

-   Fix deployment docs

## 3.1.1

### Patch Changes

-   5fd1b9e: Expose no matching version exit nodes error

## 3.1.0

### Minor Changes

-   6ef3ccf: Allow request creation adjustments without compromising fetch API

## 3.0.3

### Patch Changes

-   Rename Routing class to Client

## 3.0.2

### Patch Changes

-   renamed to u(unlinked)HTTP

## 3.0.1

### Patch Changes

-   Fix compatible exit app versions'

## 3.0.0

### Major Changes

-   9a6a269: Return fetch typical Response object from routing's fetch shim.
    This will allow to retrieve binary data as usual via `.blob()` function.

### Minor Changes

-   9a6a269: Forward response data as binary identical to actual response.
-   9a6a269: Added busy waiting isReady function to allow checking of available node pairs before actually sending a request.

### Patch Changes

-   9a6a269: Slightly reduce request response size payloads.
-   9a6a269: Increase privacy by choosing routes at random after some sanity checks.
