# Set Generation

The MVP uses Beam Search with constraint-aware pruning.

## Inputs

- Imported tracks with normalized features.
- Seed track IDs in user-defined order.
- Target duration and tolerance.
- Variant profile.
- Energy curve.

## Constraints

- Seed tracks must appear.
- Seed order is preserved.
- Tracks cannot repeat.
- Repeated artists are penalized.
- Target duration is respected within tolerance when possible.

## Search Behavior

The search starts from the first seed track. Non-seed candidates are ranked using transition score, energy curve alignment, and artist repetition penalty. Remaining seeds are inserted according to their proportional anchor position in the target duration.

If no valid path can include all seeds, the generator returns an actionable error message.
