FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    CVIS_USE_NAMESPACES=false \
    CVIS_USE_PRLIMIT=true \
    CVIS_MAX_CONCURRENT_JOBS=1 \
    CVIS_MEMORY_MB=384 \
    CVIS_WORK_ROOT=/tmp/cvis-jobs

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc gdb python3 util-linux \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node src ./src
COPY --chown=node:node public ./public

USER node

EXPOSE 10000

CMD ["node", "src/server.js"]
