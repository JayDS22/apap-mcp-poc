# Multi-stage build to keep the production image lean.
# Stage 1 builds the TypeScript, stage 2 runs the compiled JS.

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

# Only install production deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Copy drizzle config for schema push
COPY drizzle.config.ts ./
COPY src/db/schema.ts ./src/db/schema.ts

# The server runs on port 9000 by default (matching the APAP RI)
EXPOSE 9000

# Health check so Docker Compose knows when we're ready
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:9000/healthz').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
