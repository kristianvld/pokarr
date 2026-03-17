# Dashboard and Activity

The app is split into a few focused views so you can move from setup to review to action quickly.

## Overview

Overview summarizes:

- configured instance count
- enabled rule count
- total run count
- stored backup count
- next scheduled run

## Rules

The Rules view shows:

- cadence
- batch size
- cooldown
- target type
- next run time
- enabled state
- quick actions to run, refresh queue data, edit, or toggle

## Queue

Queue is a snapshot of items that are eligible right now, rebuilt from the persisted scan cache. It shows:

- item title
- rule
- source instance
- target type
- release date
- projected next run slot
- backoff status
- why the item is in scope

The queue also surfaces rule-level issues when scan data is missing, stale, or a connected service could not be reached.

## Activity

Activity is the run ledger. Each row records:

- start and end timestamps
- status
- selected count
- dispatched count
- summary
- trigger source

## System

The System view contains:

- worker status and the active scan phase
- per-instance scan state, cache coverage, and next scheduled scan
- recent scan history and manual full-scan or queue-rebuild actions
- backup history
- restore actions
- a synthesized event log built from scans, runs, backups, and restore results

The log is not a live server stdout or stderr stream.
