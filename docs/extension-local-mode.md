# Extension Local Mode

## Goal

The extension exists to launch the same page-context recorder on sites you do not control locally. It should never become a second capture implementation.

## Components

- background/service worker
- popup UI
- options page
- content script bridge
- page-context injected bridge script

## Data Flow

1. Popup asks background to start or stop recording.
2. Background injects the content script into the active tab.
3. Content injects the page bridge into the page context.
4. Page bridge initializes the shared recorder in `extension-local` mode.
5. Event batches and status messages flow back to background storage.
6. Popup exports the locally stored session JSON.

## Notes

- `activeTab` keeps the extension focused on ad hoc local testing
- raw input capture remains optional and off by default
- the export format intentionally mirrors the GTM/browser mode schema
