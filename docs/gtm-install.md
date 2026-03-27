# GTM Install

## Artifacts

- IIFE bundle: `packages/sdk-browser/dist/iife/flow-recorder.iife.js`
- ESM bundle: `packages/sdk-browser/dist/index.js`

## Custom HTML Pattern

1. Make the IIFE bundle available from a trusted static origin, or paste its contents into a managed tag when appropriate.
2. Add a GTM Custom HTML tag.
3. Initialize the global API with an explicit config object.

Example:

```html
<script src="https://static.example.com/flow-recorder.iife.js"></script>
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

## Trigger Notes

- prefer page-view style triggers for the initial bootstrap
- keep initialization consent-aware if your site requires it
- use path-based conditions to disable capture on sensitive routes
- confirm the bundle only runs once per page instance
