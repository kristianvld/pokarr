# Backups and Restore

`pokarr` stores its state in a local SQLite database and keeps backup snapshots in the data directory.

## Default backup behavior

- backup target: local SQLite database
- retention default: 90 days
- schedule default: daily at `03:00`
- scheduled backups are created automatically by the background worker
- you can also create a backup manually from the UI
- retention is enforced by backup age, not by a hidden count cap
- changing the retention window applies pruning immediately

Backup scheduling uses a numeric five-field cron expression with standard cron day-of-month/day-of-week OR semantics.

## What backups protect

- instances
- rules
- run history
- notification settings
- queue snapshot metadata

## Restore expectations

Restore is available in the app:

1. choose a backup from the UI
2. confirm the restore
3. `pokarr` creates a safety backup of the live database
4. `pokarr` waits for background work to finish, then replaces the live SQLite file
5. backup metadata is reconciled so both the restored backup and the safety backup remain visible in history
6. the queue snapshot is rebuilt after restore

If the selected backup cannot be opened cleanly, `pokarr` rolls the live database back to the safety backup automatically and records the failed restore attempt in backup history.
