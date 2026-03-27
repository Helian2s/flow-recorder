# Flow Recorder

Flow Recorder is a TypeScript monorepo for a browser-based user-flow recorder that captures replay-oriented interaction data from modern web applications. It ships one shared recorder core that runs in the page context, plus two bootstrap paths around that same core: a GTM-friendly browser SDK and a Chrome Manifest V3 extension for local testing.

## Why Two Runtime Modes

- `gtm` is the production-like path. It is intended for first-party deployment through a GTM Custom HTML tag or a later GTM Custom Template.
- `extension-local` is the developer harness. It injects the same page-context recorder into the active tab and stores/export sessions locally without creating a second recorder implementation.

## Quick Start

```bash
pnpm install
pnpm build
pnpm test
pnpm dev:demo
pnpm dev:extension
pnpm lint
```

After `pnpm dev:demo`, open the demo SPA and click `Init GTM-like recorder`. After `pnpm dev:extension`, load [apps/extension/dist](/home/val/Documents/proofica/flow-recorder/apps/extension/dist) as an unpacked extension in Chrome developer mode.

## Architecture

```text
                         +-----------------------------+
                         |  packages/schema            |
                         |  shared event + snapshot    |
                         +-------------+---------------+
                                       |
                  +--------------------+--------------------+
                  |                                         |
      +-----------v-----------+                 +-----------v-----------+
      | packages/selector-    |                 | packages/transport    |
      | engine                |                 | fetch / beacon /      |
      | locator candidates    |                 | extension bridge      |
      +-----------+-----------+                 +-----------+-----------+
                  |                                         |
                  +--------------------+--------------------+
                                       |
                             +---------v---------+
                             | recorder-core     |
                             | page-context      |
                             | identity, route,  |
                             | DOM, network,     |
                             | settle, snapshots |
                             +----+----------+---+
                                  |          |
                 +----------------+          +----------------+
                 |                                          |
       +---------v----------+                    +-----------v-----------+
       | sdk-browser        |                    | apps/extension        |
       | GTM/global API     |                    | MV3 launcher/bridge   |
       +---------+----------+                    +-----------+-----------+
                 |                                           |
        +--------v--------+                         +--------v--------+
        | host page / GTM |                         | active tab page |
        +-----------------+                         +-----------------+
```

More detail is in [docs/architecture.md](/home/val/Documents/proofica/flow-recorder/docs/architecture.md).

## Privacy And Redaction

- Text inputs are masked by default in `gtm` mode.
- Password, hidden, token-like, and payment-like fields are omitted by default.
- Query parameter redaction is supported.
- Extension-local raw capture exists only behind explicit configuration.

See [docs/privacy-redaction.md](/home/val/Documents/proofica/flow-recorder/docs/privacy-redaction.md).

## GTM Setup Example

The SDK exposes `window.FlowRecorder` and produces both ESM and IIFE outputs. A minimal GTM-style snippet is in [examples/gtm-custom-html/snippet.html](/home/val/Documents/proofica/flow-recorder/examples/gtm-custom-html/snippet.html).

```html
<script>
  window.FlowRecorder.init({
    endpoint: "",
    appId: "demo-app",
    mode: "gtm",
    autoStart: true,
    debug: true
  });
</script>
```

Detailed setup notes: [docs/gtm-install.md](/home/val/Documents/proofica/flow-recorder/docs/gtm-install.md).

## Chrome Extension Setup Example

1. Run `pnpm dev:extension` or `pnpm build`.
2. Open `chrome://extensions`.
3. Enable Developer Mode.
4. Load unpacked from [apps/extension/dist](/home/val/Documents/proofica/flow-recorder/apps/extension/dist).
5. Open the popup on any tab and click `Start recording`.

Detailed extension notes: [docs/extension-local-mode.md](/home/val/Documents/proofica/flow-recorder/docs/extension-local-mode.md).

## Repository Layout

```text
docs/                    Architecture, privacy, install, readiness notes
packages/schema          Shared event, snapshot, batch, config model
packages/selector-engine Replay-oriented selector generation
packages/transport       Pluggable transports including extension bridge
packages/recorder-core   Shared page-context recorder engine
packages/sdk-browser     Browser SDK, GTM/global API, IIFE output
packages/devtools-shared Shared bridge message contracts
apps/extension           Chrome MV3 harness
apps/demo-spa            Dynamic test application
examples/                GTM snippet and fixture session exports
scripts/                 Build, dev, and release helpers
```

## Limitations

- The repository does not implement Selenium generation yet.
- The Chrome harness targets Chrome MV3 only.
- Same-origin iframe and open shadow-root support are best-effort.
- Full-page HTML capture is intentionally not performed on every event.
- The default transport endpoint is blank.

## Future Work

- Selenium replay generation based on selector candidates and replay hints
- Better clustering of stabilized states into future page abstractions
- Richer extension inspector tooling and optional debug overlay
- Stronger same-origin iframe coverage and more accessibility-first locator heuristics

See [docs/selenium-readiness.md](/home/val/Documents/proofica/flow-recorder/docs/selenium-readiness.md).
