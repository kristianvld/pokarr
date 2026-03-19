# Authentication and Access

`pokarr` is designed for one built-in admin account.

## Sign-In Flow

- On first launch, the setup screen creates the account.
- Later visits sign in with that same username and password.
- The app UI and application API require an authenticated session.
- Session records live in the data directory alongside the rest of the app state.

## Single-User Design

Pokarr keeps account management intentionally simple. It is built for one admin account, which fits the most common self-hosted setup: one person or household managing a media stack.

## Deployment Guidance

- Use a persistent `POKARR_DATA_DIR`.
- For access from other machines or remote access, use HTTPS in your preferred deployment or reverse proxy.
- Leave `POKARR_COOKIE_SECURE=auto` unless you have a reason to override it.
- Protect the data directory and backup files like the rest of your application data.

## What Lives In The Data Directory

The app stores:

- Sonarr and Radarr API keys
- the password hash for the account
- session records
- the configured notification URL
- backup snapshots

That data lives in the local SQLite database and backup directory.
