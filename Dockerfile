# Two-stage build. Stage 1 compiles TS. Stage 2 runs compiled JS.
# drizzle-kit stays in the runner image for schema push on first boot.

FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ---- Runner ----
FROM node:20-slim AS runner
WORKDIR /app

# Full install (not --omit=dev) because drizzle-kit push runs at container start.
# In production you would run migrations out-of-band, but for a POC that needs
# to work with a single `docker compose up`, this is the pragmatic choice.
COPY package.json package-lock.json* ./
RUN npm ci && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY drizzle.config.ts ./
COPY src/db/schema.ts ./src/db/schema.ts
COPY startup.js ./

EXPOSE 9000

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:9000/healthz').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "startup.js"]
