# Concepts

These are the main terms used throughout the app and docs.

## Instance

An instance is one Sonarr or Radarr connection. It stores:

- service kind
- display name
- base URL
- API key
- enabled state
- last validation time and most recent error

## Rule

A rule decides what `pokarr` should retry and on what schedule. Every rule belongs to exactly one instance and defines:

- cadence
- batch size
- cooldown
- target type: movie, series, or season
- scope settings
- guard settings
- optional backoff behavior
- enabled state

## Queue

The queue is a snapshot of items that are eligible right now. It is rebuilt from the local scan cache instead of forcing a fresh Arr library walk on every rule tick. Each queue row includes:

- the rule and instance that selected it
- why it is eligible
- the next projected run slot for that item
- whether backoff is active

The queue also stores rule-level issues, such as an unreachable instance, a cold cache, or stale scan data.

## Scan Worker

The scan worker is the background process that keeps Arr data warm for queue evaluation and rule runs. It:

- performs a full scan on first startup or when manually requested
- refreshes catalogs and a limited batch of stale Sonarr series details incrementally in the background
- records per-instance scan state plus a scan history ledger
- lets rules run against cached data and only blocks when the cache is cold or too stale to trust

## Run

A run is one manual or scheduled execution of a rule. Each run records:

- start and end time
- status
- selected item count
- dispatched command count
- summary
- item-level search results, including triggered searches, per-item failures, and deferred items
- optional skip reason

## Backup

A backup is a SQLite snapshot stored on disk. `pokarr` also creates a safety backup before a restore.

## Notification

Notifications are sent through a single Apprise URL. `pokarr` uses that URL for test sends plus run, backup, restore, and instance-health events.
