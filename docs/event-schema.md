# Event Schema

## Event Envelope

Every batch contains:

- batch metadata
- session metadata
- an ordered list of normalized events

The canonical TypeScript definitions live in [packages/schema/src/index.ts](/home/val/Documents/proofica/flow-recorder/packages/schema/src/index.ts).

## Base Event Fields

Every event contains:

- `event_id`
- `visitor_id`
- `session_id`
- `pageview_id`
- `tab_id`
- `route_id`
- `state_id`
- `ts_unix_ms`
- `ts_perf_ms`
- `sequence_no`
- `mode`
- `url`, `url_path`, `url_hash`
- `title`, `referrer`
- viewport metadata
- document ready and visibility state

## Categories

- `user`: clicks, input, submit, keyboard, scroll markers
- `navigation`: document load, route change, history, visibility/page events
- `system`: network start/end, mutation bursts, state settle lifecycle, snapshots

## Replay-Oriented Fields

Action-like events can additionally include:

- `action_kind`
- `target`
- `selectors`
- `visible_context`
- `captured_value`
- `redaction`
- `replay_hints`
- `state_id_after`
- container and heading context

## Snapshots

Snapshots are not captured on every event. Default `balanced` mode captures them at meaningful boundaries such as route changes, submits, or settled UI state.
