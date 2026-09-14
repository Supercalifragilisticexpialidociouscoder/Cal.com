# syntax=docker/dockerfile:1
#
# The Infin8 Calendar API. The client is built separately and served by
# Cloudflare Pages, so this image contains the Node server only.
#
# State lives in DATA_DIR (SQLite database + uploaded attachments), so the
# container needs a persistent disk mounted there. Without one, every restart
# starts from an empty calendar.

FROM node:22-bookworm-slim AS build
WORKDIR /app

# Manifests first, so dependency layers survive source-only changes.
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci

COPY server ./server
RUN npm run build --workspace server

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/
# Production dependencies for the server workspace only - no client toolchain.
RUN npm ci --omit=dev --workspace server --include-workspace-root \
  && npm cache clean --force

COPY --from=build /app/server/dist ./server/dist

ENV PORT=4000 \
    DATA_DIR=/data
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
