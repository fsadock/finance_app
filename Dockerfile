# Finanças in a container: starts with the machine (restart policy in compose.yaml), data in the /data volume.
FROM node:24.21.0-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    npm_config_update_notifier=false \
    # The app groups transactions by local month; the container default (UTC) shifts late-evening ones.
    TZ=America/Sao_Paulo

# OpenSSL: Prisma's migration engine looks for it. pnpm's version comes from package.json's "packageManager".
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
    && corepack enable && mkdir -p /app /data && chown node:node /app /data
WORKDIR /app
USER node

# Dependencies first, so code-only changes reuse this layer. `postinstall` runs `prisma generate`.
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY --chown=node:node prisma/schema.prisma prisma/schema.prisma
# The pnpm store lives in a build cache, not in the image (it would double its size). The explicit
# --store-dir matters: on a different filesystem pnpm otherwise creates a second store inside /app.
RUN --mount=type=cache,id=financas-pnpm-store,target=/home/node/.pnpm-store,uid=1000,gid=1000 \
    pnpm install --frozen-lockfile --store-dir /home/node/.pnpm-store --package-import-method copy

COPY --chown=node:node . .
RUN pnpm build && rm -rf .next/cache

ENV NODE_ENV=production \
    DATABASE_URL=file:/data/finance.db
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=10s --start-period=60s \
  CMD node -e "fetch('http://127.0.0.1:3000/', { redirect: 'manual' }).then((r) => process.exit(r.status < 500 ? 0 : 1), () => process.exit(1))"
ENTRYPOINT ["/app/docker/entrypoint.sh"]
