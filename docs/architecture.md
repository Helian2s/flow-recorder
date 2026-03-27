# Architecture

## Core Rule

There is exactly one recorder implementation for capture behavior: `packages/recorder-core`. Both runtime modes inject that same page-context logic.

## Packages

- `packages/schema`: TypeScript interfaces and JSON-schema-style envelope for batches, events, snapshots, selectors, redaction metadata, and runtime config.
- `packages/selector-engine`: Prioritized replay locator generation with semantic hints.
- `packages/transport`: Transport adapters for no-op, console, fetch/sendBeacon, and extension bridge delivery.
- `packages/recorder-core`: Page recorder subsystems for identity, route tracking, user events, mutations, network, visible context, state settlement, snapshots, and queueing.
- `packages/sdk-browser`: Browser API and global install path for GTM-like use.
- `packages/devtools-shared`: Shared message contracts for the extension content/page bridge.

## Recorder Subsystems

- `IdentityManager`: visitor, session, pageview, route, state, and tab ids.
- `RouteTracker`: `pushState`, `replaceState`, `popstate`, hash, visibility, and page lifecycle observation.
- `NetworkTracker`: fetch and XHR metadata without bodies.
- `StateSettlementManager`: waits for DOM quiet and network idle before promoting a new `state_id`.
- `DomRefRegistry` and visible-context helpers: bounded visible page context around actions.
- `QueueManager`: bounded buffering and batched transport delivery.
- Redaction helpers: value masking, hashing, omission, and sensitive-target detection.

## Runtime Flows

### GTM

1. Host page loads the browser bundle.
2. `window.FlowRecorder.init(...)` configures the shared recorder.
3. The recorder attaches listeners in the page context.
4. Events are emitted into the selected transport.

### Extension Local

1. Popup asks the background worker to start capture on the active tab.
2. Background injects `content.js`.
3. `content.js` injects `page-bridge.js` into the page.
4. `page-bridge.js` initializes the same shared recorder in `extension-local` mode.
5. Recorder batches are sent through the extension bridge transport.
6. Content script forwards batches/status to background storage.
7. Popup reads state and exports JSON.

## State Boundary Strategy

- Dirty triggers: route changes, action-like events, DOM mutation bursts, network completion.
- Quiet checks: no meaningful mutations for `domQuietMs`, no in-flight requests for `networkIdleMs`, capped by `maxSettleWaitMs`.
- Boundary outputs: `state.settling.start`, `state.settled`, optional snapshot creation.
