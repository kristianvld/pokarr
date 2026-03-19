# pokarr

`pokarr` helps you control when Sonarr and Radarr retry searches. Instead of waiting for the default cadence in each Arr app, you create rules that describe what should be retried, how often it should run, and how conservative or aggressive it should be.

## Why People Use Pokarr

- Predictable retry timing instead of guesswork
- A visible queue of eligible items before runs happen
- One place for rules, run history, backups, health checks, and notifications
- Support for multiple Sonarr and Radarr instances in the same app

## Supported Targets

| Service | Rule target | Status |
| --- | --- | --- |
| Radarr | Movie | Supported |
| Sonarr | Series | Supported |
| Sonarr | Season | Supported |
| Sonarr | Episode | Used only as season backoff fallback |

## Start Here

1. [Getting Started](./getting-started)
2. [Concepts](./concepts)
3. [Connecting Instances](./connecting-instances)
4. [Creating Rules](./creating-rules)
5. [Authentication and Access](./security-model)

Minimal Compose example:

```yaml
services:
  pokarr:
    image: ghcr.io/kristianvld/pokarr:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      TZ: Europe/Amsterdam
    volumes:
      - ./data:/app/data
```

## What You Will Find In The App

- Single Bun service for API, scheduler, and static UI delivery
- One-account sign-in with first-launch setup
- React UI with Overview, Instances, Rules, Queue, Activity, Settings, and System views
- SQLite-backed local state with manual and scheduled backups
- Background scan worker with cached queue evaluation and manual full scans
- Apprise-backed notifications
- Published docs, container images, and automated CI checks
