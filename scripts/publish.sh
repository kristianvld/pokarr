#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/publish.sh [patch|minor|major] [--yes] [--dry-run] [--skip-checks]

Bump package.json, snapshot docs, create a release commit, and publish a semver tag (vX.Y.Z).
EOF
}

increment="patch"
auto_yes="false"
dry_run="false"
skip_checks="false"

compare_versions() {
  local left="$1"
  local right="$2"

  if [[ "${left}" == "${right}" ]]; then
    echo 0
    return
  fi

  if [[ "$(printf '%s\n%s\n' "${left}" "${right}" | sort -V | tail -n 1)" == "${left}" ]]; then
    echo 1
    return
  fi

  echo -1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    patch|minor|major)
      increment="$1"
      ;;
    --yes|-y)
      auto_yes="true"
      ;;
    --dry-run)
      dry_run="true"
      ;;
    --skip-checks)
      skip_checks="true"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
  shift
done

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Not inside a git repository."
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Remote \"origin\" is required."
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${branch}" == "HEAD" ]]; then
  echo "Detached HEAD is not supported for publish."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash changes before publishing."
  exit 1
fi

git fetch --tags origin

current_package_version="$(bun --eval "const pkg = await Bun.file('package.json').json(); console.log(pkg.version)")"
latest_tag="$(git tag -l 'v[0-9]*.[0-9]*.[0-9]*' | sort -V | awk 'NF{t=$0} END{print t}')"
release_mode="bump"

if [[ -z "${latest_tag:-}" ]]; then
  release_mode="initial"
  next_version="${current_package_version}"
  next_tag="v${next_version}"
  latest_tag="(none)"
else
  latest_version="${latest_tag#v}"
  version_compare="$(compare_versions "${current_package_version}" "${latest_version}")"

  if [[ "${version_compare}" == "-1" ]]; then
    echo "package.json version ${current_package_version} is behind latest tag ${latest_tag}."
    exit 1
  fi

  if [[ "${version_compare}" == "1" ]]; then
    release_mode="publish-current"
    next_version="${current_package_version}"
    next_tag="v${next_version}"
  else
    IFS='.' read -r major minor patch <<<"${latest_version}"

    case "${increment}" in
      patch)
        patch=$((patch + 1))
        ;;
      minor)
        minor=$((minor + 1))
        patch=0
        ;;
      major)
        major=$((major + 1))
        minor=0
        patch=0
        ;;
    esac

    next_tag="v${major}.${minor}.${patch}"
    next_version="${next_tag#v}"
  fi
fi

snapshot_dir="docs/versions/${next_tag}"

if git rev-parse "${next_tag}" >/dev/null 2>&1; then
  echo "Tag ${next_tag} already exists."
  exit 1
fi

if [[ -e "${snapshot_dir}" ]]; then
  echo "Snapshot directory ${snapshot_dir} already exists."
  exit 1
fi

echo "Release plan:"
echo "  mode:              ${release_mode}"
echo "  branch:            ${branch}"
echo "  latest tag:        ${latest_tag}"
echo "  increment:         ${increment}"
echo "  package version:   ${current_package_version} -> ${next_version}"
echo "  docs snapshot dir: ${snapshot_dir}"
echo "  new tag:           ${next_tag}"
echo

if [[ "${dry_run}" == "true" ]]; then
  echo "Dry run only. No files changed."
  exit 0
fi

if [[ "${auto_yes}" != "true" ]]; then
  read -r -p "Continue and publish ${next_tag}? [y/N] " confirm
  if [[ ! "${confirm}" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
  fi
fi

if [[ "${skip_checks}" != "true" ]]; then
  echo "Running local checks..."
  bun run check
  bun run smoke:built
fi

if [[ "${current_package_version}" != "${next_version}" ]]; then
  echo "Updating package version to ${next_version}..."
  bun --eval "
    const pkg = await Bun.file('package.json').json();
    pkg.version = '${next_version}';
    await Bun.write('package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
else
  echo "package.json already set to ${next_version}."
fi

echo "Snapshotting docs to ${snapshot_dir}..."
bun run docs:snapshot -- "${next_tag}"

git add package.json "${snapshot_dir}"
git commit -m "release: ${next_tag}"

echo "Pushing branch ${branch}..."
git push origin "${branch}"

echo "Creating tag ${next_tag}..."
git tag -a "${next_tag}" -m "${next_tag}"

echo "Pushing tag ${next_tag}..."
git push origin "${next_tag}"

echo "Published ${next_tag}."
