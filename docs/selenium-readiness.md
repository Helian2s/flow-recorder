# Selenium Readiness

This repository does not generate Selenium tests yet, but the event model is shaped so that generation can be added as the next milestone.

## Fields Added For Future Replay

- prioritized selector candidates with confidence and rationale
- normalized `action_kind`
- `state_id` and `state_id_after`
- visible context snapshots
- route template guesses
- dominant container signatures
- modal, landmark, heading, and form context
- wait hints derived from quiet-window and network-idle observation

## Expected Next Step

A future generator should be able to:

1. map recorded events to Selenium actions
2. choose the best locator candidate
3. infer waits from `state.settled`, route change, and network markers
4. cluster repeated states into future view abstractions
