FROM oven/bun:1.4.5-alpine@sha256:da816670775f4c2b4e990b6b1847cf5540dcdc721a42033dd331ce7a88ba6a3b AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY bunfig.toml index.html package.json server.ts tsconfig.json ./
COPY public ./public
COPY scripts ./scripts
COPY src ./src
RUN bun run build

FROM python:3.13-alpine3.24@sha256:9ef1a599f863231c3d91e941389bfdc4a2d6070557243d54df1a4e57015b960e AS runtime
WORKDIR /app

ARG APP_VERSION=0.1.0-dev
ARG BUILD_DATE
ARG COMMIT

ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    POKARR_DATA_DIR=/app/data \
    TZ=UTC \
    PYTHONUNBUFFERED=1

RUN apk upgrade --no-cache && apk add --no-cache tzdata libstdc++
COPY requirements.txt ./
RUN pip install --require-hashes --disable-pip-version-check --no-cache-dir --no-compile -r requirements.txt && pip uninstall --yes pip setuptools
RUN addgroup -S -g 101 pokarr && adduser -S -u 100 -G pokarr -h /app -H pokarr

COPY --from=build /usr/local/bin/bun /usr/local/bin/bun
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/scripts ./scripts

RUN mkdir -p /app/data/backups && chown -R pokarr:pokarr /app
RUN bun --version >/dev/null && apprise --version >/dev/null

LABEL org.opencontainers.image.title="pokarr"
LABEL org.opencontainers.image.description="Controlled Sonarr and Radarr search nudges"
LABEL org.opencontainers.image.version="${APP_VERSION}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${COMMIT}"
LABEL org.opencontainers.image.source="https://github.com/kristianvld/pokarr"

USER pokarr:pokarr

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD python -c "import json, sys, urllib.request; response = urllib.request.urlopen('http://127.0.0.1:3000/api/auth/session', timeout=4); payload = json.load(response); sys.exit(0 if {'setupRequired', 'authenticated'}.issubset(payload.keys()) else 1)"

CMD ["bun", "scripts/start-built.ts"]
