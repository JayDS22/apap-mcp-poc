# Multi-stage build.
# Stage 1 compiles TypeScript. Stage 2 runs the compiled JS.
# We keep drizzle-kit in the runner so schema push works on first boot.

FROM node:20-slim AS builder

WORKDIR /app

# Copy dependency manifests first for better layer caching.
# npm ci only re-runs if package*.json changed.
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and compile
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ---- Production stage ----
FROM node:20-slim AS runner

WORKDIR /app

# Install all dependencies (including drizzle-kit for schema push on first boot).
# In a real production deployment you'd run migrations separately, but for a
# POC that needs to "just work" with docker compose up, this is the right call.
COPY package.json package-lock.json* ./
RUN npm ci && npm cache clean --force

# Copy compiled output from the builder
COPY --from=builder /app/dist ./dist

# Copy drizzle config + schema source (drizzle-kit push needs the TS schema)
COPY drizzle.config.ts ./
COPY src/db/schema.ts ./src/db/schema.ts

# Startup script handles schema push then launches the server.
# This avoids the drizzle-kit CLI interactive prompt breaking in Docker.
COPY startup.js ./

# The server runs on port 9000 by default (matching the APAP RI)
EXPOSE 9000

# Health check so Docker Compose knows when we're ready
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:9000/healthz').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "startup.js"]
