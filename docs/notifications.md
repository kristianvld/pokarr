# Notifications

Pokarr accepts a single notification URL and uses Apprise to validate and send notifications.

## Notification URL

- Discord webhooks work out of the box.
- Any other Apprise-supported URL works too.
- The notification URL is stored with the rest of the app settings, so backup and restore keep it in sync with the rest of the configuration.
- Pokarr appends default Apprise branding for `app_id`, `app_desc`, `app_url`, `image_url_logo`, and `image_url_mask`.
- The default logo URL is `https://raw.githubusercontent.com/kristianvld/pokarr/main/public/favicon.png`.
- You can override any of those branding fields by adding the same query params to the notification URL yourself.
- Notifications are sent as Markdown via Apprise so supported services can render stronger formatting while plain-text fallbacks remain readable.

## What it sends

- Rule run success
- Rule run failure
- Backup success
- Backup failure
- Restore success
- Restore failure
- Instance connection lost
- Instance connection restored

Connection lost and restored messages come from both background health checks and real Arr requests. When possible, Pokarr includes a short reason so you can quickly tell whether the issue was a timeout, proxy problem, auth failure, or unexpected API response.

## Container behavior

The official container image includes the `apprise` CLI, so notification URL validation and test sends work in the stock image.
