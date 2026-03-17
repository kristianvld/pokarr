# pokarr

`pokarr` is a self-hosted web app that gives Sonarr and Radarr a predictable retry schedule. Create rules that decide what to retry, how often to retry it, and how long to wait before trying again.

[![CI](https://github.com/kristianvld/pokarr/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kristianvld/pokarr/actions/workflows/ci.yml)
[![Docs](https://github.com/kristianvld/pokarr/actions/workflows/docs.yml/badge.svg?branch=main)](https://github.com/kristianvld/pokarr/actions/workflows/docs.yml)
[![Release](https://github.com/kristianvld/pokarr/actions/workflows/release.yml/badge.svg)](https://github.com/kristianvld/pokarr/actions/workflows/release.yml)

## Why Pokarr

- Set your own retry cadence instead of relying on default Arr timing.
- Review a queue of eligible items before runs happen.
- Work across multiple Sonarr and Radarr instances.
- Keep rules, runs, backups, health checks, and notifications in one place.

## Highlights

- Single Bun service for API, scheduler, and static UI delivery
- One-account sign-in with first-launch setup
- React UI with Overview, Instances, Rules, Queue, Activity, Settings, and System views
- Rule evaluation for Radarr movies plus Sonarr series and seasons
- Season backoff that can escalate to Sonarr episode searches
- SQLite-backed local state, backup history, and restore safety backups
- Background scan worker with cached queue snapshots, scan history, and manual full-scan controls
- Instance health checks, queue snapshots, and Apprise-backed notifications
- Published docs, container images, and automated CI checks

## Quick Start

Use Docker Compose with the published GHCR image:

```yaml
services:
  pokarr:
    image: ghcr.io/kristianvld/pokarr:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
```

Start it with:

```bash
docker compose up -d
```

On first launch, create your account, connect a Sonarr or Radarr instance, and add your first rule.

If you prefer plain Docker instead of Compose:

```bash
docker run -d \
  --restart unless-stopped \
  -p 3000:3000 \
  -v "$PWD/data:/app/data" \
  ghcr.io/kristianvld/pokarr:latest
```

## Documentation

Start with:

- [Getting Started](./docs/getting-started.md)
- [Concepts](./docs/concepts.md)
- [Connecting Instances](./docs/connecting-instances.md)
- [Creating Rules](./docs/creating-rules.md)
- [Authentication and Access](./docs/security-model.md)

## Configuration

`pokarr` separates runtime config from app settings:

- Environment variables control server/runtime behavior such as the listen port, data directory, cookie behavior, and advanced scheduler tuning.
- App settings such as backup retention, backup schedule, and notifications are configured in the UI and stored in the database.

Changing environment variables does not overwrite saved UI settings.

See:

- [`.env.example`](./.env.example)
- [`docs/api-and-config-reference.md`](./docs/api-and-config-reference.md)

Most users only need:

- `PORT`
- `POKARR_DATA_DIR`

Advanced runtime envs are available for session behavior, request timeouts, health checks, scheduler polling, scan-worker tuning, and restore safety. They are documented in the config reference and `.env.example`.

## Local Development

Requirements:

- Bun `1.3.10+`

Install dependencies:

```bash
bun install
```

Run the Bun development server:

```bash
bun run dev
```

`bun run dev` serves both the UI and the API on `http://localhost:3000` while live-reloading frontend changes and restarting for backend changes.

Run the full local verification suite:

```bash
bun run check
```

Run the browser-based production smoke test for the built app:

```bash
bunx playwright install chromium
bun run smoke:built
```

Run the React-specific health scan:

```bash
bun run doctor
```

The project disables React Doctor's dead-code pass because Bun's entrypoint model produces noisy false positives there. The lint and architecture diagnostics still run.

## Releases

For the release process and versioned docs setup, see [`docs/upgrade-and-release-notes.md`](./docs/upgrade-and-release-notes.md).
