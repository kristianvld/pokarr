# Backoff Behavior

Backoff exists so a rule can become more specific over time instead of repeating the same ineffective nudge forever.

## Supported Backoff Behavior

- movies stay at the movie level
- series stay at the series level
- seasons can escalate to episode searches

## Season fallback example

```text
rule target: season
batch size: 5
cooldown: 24 hours
escalate after: 3 pokes
episode fallback: enabled
minimum release age: 7 days
```

How it works:

1. `pokarr` issues season searches first.
2. If the selected season produces the same actionable episode signature across repeated successful pokes, the consecutive poke counter increases.
3. After the configured number of repeated season pokes, the rule escalates to episode searches for that season.
4. If the season leaves scope because content is acquired or thresholds are met, the backoff state resets.

## Why backoff is conservative

The goal is to fit inside the Arr ecosystem without turning into a noisy retry storm. Escalation should only happen when the coarser search level has already failed repeatedly.
