FROM oven/bun:1.3.10@sha256:b86c67b531d87b4db11470d9b2bd0c519b1976eee6fcd71634e73abfa6230d2e AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY bunfig.toml index.html package.json server.ts tsconfig.json ./
COPY public ./public
COPY scripts ./scripts
COPY src ./src
RUN bun run build

FROM python:3.13-slim@sha256:8bc60ca09afaa8ea0d6d1220bde073bacfedd66a4bf8129cbdc8ef0e16c8a952 AS runtime
WORKDIR /app

ARG APP_VERSION=0.1.0-dev
ARG BUILD_DATE
ARG COMMIT

ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    POKARR_DATA_DIR=/app/data \
    PYTHONUNBUFFERED=1

RUN pip install --disable-pip-version-check --no-cache-dir --no-compile apprise==1.9.8
RUN addgroup --system pokarr && adduser --system --ingroup pokarr --home /app --no-create-home pokarr

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
