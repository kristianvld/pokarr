# Connecting Instances

`pokarr` talks to Arr apps over their HTTP APIs.

## What You Need

- `kind`: `sonarr` or `radarr`
- `name`: a label you will recognize in the UI
- `baseUrl`: full app URL
- `apiKey`: API key from the Arr UI

## What Validation Checks

Validation uses the Arr system status endpoint:

- Sonarr: `GET /api/v3/system/status`
- Radarr: `GET /api/v3/system/status`

Validation answers:

- can `pokarr` reach the instance?
- is the API key accepted?
- does the status payload look like a supported Sonarr or Radarr API?
- should the instance be marked healthy or unhealthy?

When validation fails, `pokarr` stores the latest reason and includes a short response snippet when it can. That helps distinguish transport failures, proxy and gateway failures, auth problems, unsupported API shapes, and malformed responses.

## Ongoing health checks

Validation is not only a one-time setup action.

- Background health checks periodically re-validate enabled instances.
- Runtime Arr requests can also mark an instance healthy or unhealthy.
- When transport, proxy, or server-side failures happen, `pokarr` temporarily pauses new background requests to that instance before retrying.
- Optional notifications can report connection lost and restored events.

## Recommended instance strategy

- add one entry per Sonarr or Radarr deployment
- use human-readable names, especially if you run multiple libraries or profiles
- disable an instance instead of deleting it while testing rule behavior
