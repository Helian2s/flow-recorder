# Privacy And Redaction

## Defaults

- Password and hidden inputs are never recorded raw by default.
- Token-like, secret-like, payment-like, and auth-like field names are treated as sensitive.
- GTM mode masks text inputs unless explicitly allowlisted.
- Extension-local cleartext capture is opt-in.

## Supported Controls

- selector allowlist and denylist
- field-name regex denylist
- input-type denylist
- query-parameter redaction
- raw, masked, hashed, or omitted value modes

## Snapshot Handling

- full-page capture on every event is intentionally disabled
- snapshot fragments are size-capped
- form controls are sanitized during fragment serialization
- visible context is bounded to a filtered set of relevant nodes

## Operational Guidance

- keep `endpoint` blank in local development unless transport is intentionally being tested
- use allowlists for any field whose clear text is actually required
- prefer masked or hashed capture unless a developer explicitly needs raw values in extension-local mode
