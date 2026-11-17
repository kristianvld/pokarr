# FAQ

## Does pokarr replace Sonarr or Radarr scheduling?

No. It adds a separate retry layer that you control.

## Why not trigger huge library-wide searches?

The point is to stay deliberate and low-noise. `pokarr` should feel safe to run continuously.

## What happens on first launch?

Create the one built-in admin account in the setup screen, then sign in with that same account on later visits.

## Can I connect more than one Sonarr or Radarr instance?

Yes. Add one entry per Sonarr or Radarr deployment.

## How many users does pokarr support?

Pokarr is designed for one admin account.

## Which rule targets are supported?

- Radarr movies
- Sonarr series
- Sonarr seasons
- Sonarr episodes through season backoff

## Where does pokarr store its data?

In a local SQLite database and backup directory under `POKARR_DATA_DIR`.

## Do I need a reverse proxy?

No. Pokarr runs fine on its own. If you want HTTPS or remote access, use the deployment setup you prefer.
