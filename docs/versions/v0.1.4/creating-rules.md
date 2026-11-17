# Creating Rules

Rules are the core of `pokarr`. Each rule says what to retry, how often to run, and how many items to dispatch each time.

## Rule Fields

- name
- cadence
- batch size
- cooldown
- target type
- scope
- guards
- backoff
- enabled state

## Supported Targets

- Radarr: `movie`
- Sonarr: `series`
- Sonarr: `season`

Episode searches are available through season backoff when you want a rule to narrow its focus over time.

## Good Starting Point

For a first movie rule:

```text
cadence: 10 minutes
batch size: 5
cooldown: 24 hours
target kind: movie
missing only: yes
monitored only: yes
```

Start conservative, watch the queue for a while, then tighten cadence or lower cooldown if you want more activity.

## Scheduler Behavior

- Rules do not overlap with themselves.
- Missed intervals are not replayed in a burst.
- The next run is based on creation time until the first successful or skipped run is recorded, then on the latest run start time.
- When more items are eligible than one run can dispatch, `pokarr` chooses the oldest-waiting items first.

## Manual runs

Every rule supports a manual run path so you can:

- confirm the rule was saved correctly
- verify run logging
- verify connected service behavior without waiting for the scheduler
