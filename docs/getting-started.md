# Getting Started

`pokarr` is easiest to run beside the rest of your media stack with Docker Compose, but local Bun development is also supported.

## Requirements

- Bun `1.3.10+` for local development
- Sonarr and/or Radarr instances with reachable HTTP APIs
- API keys for the instances you want to connect
- A writable directory or volume for SQLite data and backups

## Quick Start With Docker

Create a minimal Compose file with the published image:

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

Then open `http://localhost:3000`.

On first launch, create your account in the setup screen. After that, sign in with the same username and password on later visits. Configure backup retention, backup schedule, and notifications in the Settings view after setup.

If you prefer plain Docker instead of Compose, run:

```bash
docker run -d \
  --restart unless-stopped \
  -p 3000:3000 \
  -v "$PWD/data:/app/data" \
  ghcr.io/kristianvld/pokarr:latest
```

## Local Development

```bash
bun install
bun run dev
```

`bun run dev` serves the UI and API together on port `3000`. Frontend assets are handled by Bun's full-stack dev server, and backend code reloads through Bun watch mode.

For a local built-app run:

```bash
bun run build
bun run start
```

For a browser-based smoke test against the built app:

```bash
bunx playwright install chromium
bun run smoke:built
```

## First-Run Checklist

1. Open the app and create your account.
2. Sign in and open the Instances view.
3. Add a Sonarr or Radarr instance.
4. Test or validate the connection.
5. Create a rule with cadence, batch size, cooldown, and scope settings.
6. Open Queue to inspect what is eligible right now.
7. Trigger a manual run.
8. Optionally configure backups and notifications.

## Where Data Lives

- Default local data dir: `./data`
- Default container data dir: `/app/data`
- SQLite database file: `pokarr.sqlite`
- Backup files: `${POKARR_DATA_DIR}/backups`
