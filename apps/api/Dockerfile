# syntax=docker/dockerfile:1.7
# Build context = ROOT repo:  docker build -f apps/api/Dockerfile --target runtime .
ARG NODE_IMAGE=node:24-bookworm-slim

# ---------- base: pnpm + OpenSSL (dibutuhkan Prisma) ----------
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable \
 && corepack prepare pnpm@12.14.0 --activate
WORKDIR /repo

# ---------- build: install penuh, build shared + api, generate Prisma client ----------
FROM base AS build
COPY --chmod=a+rX pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY --chmod=a+rX apps/api/package.json apps/api/
COPY --chmod=a+rX apps/web/package.json apps/web/
COPY --chmod=a+rX packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY --chmod=a+rX packages/shared packages/shared
COPY --chmod=a+rX apps/api apps/api
RUN pnpm --filter shared build \
 && pnpm --filter api exec prisma generate \
 && pnpm --filter api build

# ---------- tessdata: data bahasa OCR dibundel saat build (tanpa unduhan saat runtime) ----------
FROM ${NODE_IMAGE} AS tessdata
WORKDIR /tessdata
RUN node -e "\
const fs=require('fs');\
(async()=>{for(const l of ['ind','eng']){\
const r=await fetch('https://cdn.jsdelivr.net/npm/@tesseract.js-data/'+l+'/4.0.0_best_int/'+l+'.traineddata.gz');\
if(!r.ok)throw new Error(l+' '+r.status);\
fs.writeFileSync(l+'.traineddata.gz',Buffer.from(await r.arrayBuffer()));}})()\
.catch(e=>{console.error(e);process.exit(1)})" \
 && ls -l /tessdata

# ---------- prod-deps: hanya dependency produksi api ----------
FROM build AS prod-deps
RUN pnpm --filter api deploy --prod --legacy /out

# ---------- tools: dipakai migrate deploy & create-admin (butuh prisma CLI + ts-node) ----------
# Dijalankan sebagai user non-root tanpa pnpm/corepack (tidak ada unduhan saat runtime): pakai binary lokal.
FROM build AS tools
WORKDIR /repo/apps/api
ENV NODE_ENV=production
USER node
CMD ["./node_modules/.bin/prisma", "migrate", "status"]

# ---------- runtime ----------
FROM ${NODE_IMAGE} AS runtime
ARG GIT_COMMIT=dev
ENV NODE_ENV=production PORT=3000 GIT_COMMIT=${GIT_COMMIT} \
    TESSDATA_DIR=/app/tessdata RECEIPT_STORAGE_DIR=/data/receipts
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=prod-deps --chown=node:node /out/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
COPY --from=build --chown=node:node /repo/apps/api/prisma ./prisma
COPY --from=tessdata --chown=node:node /tessdata ./tessdata
RUN mkdir -p /data/receipts && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
