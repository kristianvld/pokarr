# Releases and Versioned Docs

## Documentation versions

Docs publish in three channels:

- site root: latest stable release
- `/edge/`: preview docs built from `main`
- `/vX.Y.Z/`: frozen docs for a tagged release

## Automation

- `ci.yml` runs lint, tests, typecheck, app build, docs build, a browser smoke test against the built app, and a Docker-packaged browser smoke test.
- `docs.yml` builds edge docs plus every versioned docs copy and deploys them to GitHub Pages.
- `release.yml` builds and pushes multi-arch GHCR images, generates provenance attestation, and creates the GitHub release.

## Publishing a release

1. Make sure the working tree is clean.
2. Run `scripts/publish.sh patch`, `scripts/publish.sh minor`, or `scripts/publish.sh major`.
3. The script uses `package.json` and existing semver tags to determine the release version.
4. The script snapshots docs into `docs/versions/vX.Y.Z/`, runs the local checks plus the built-app browser smoke test, creates a release commit, and pushes the branch plus tag.
5. GitHub Actions publishes the container image, GitHub release, edge docs, and versioned docs.

## Why docs are versioned

Release docs must stay stable even while `main` keeps moving. The snapshot flow keeps each published version immutable.
