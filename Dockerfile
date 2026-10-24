# Multi-stage production build for ShadowLLM Proxy & Worker
FROM node:20-slim AS builder

WORKDIR /app

# Copy root manifests
COPY package.json package-lock.json tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/tsconfig.json ./packages/shared/
COPY apps/server/package.json ./apps/server/
COPY apps/server/tsconfig.json ./apps/server/
COPY apps/worker/package.json ./apps/worker/
COPY apps/worker/tsconfig.json ./apps/worker/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/dashboard/tsconfig.json ./apps/dashboard/

# Install all dependencies
RUN npm ci

# Copy source files
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
COPY apps/worker ./apps/worker

# Build TypeScript packages
RUN npm run build --workspace=@shadow-llm/shared && \
    npm run build --workspace=@shadow-llm/worker && \
    npm run build --workspace=@shadow-llm/server

# Production runner image
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
ENV RUN_EMBEDDED_WORKER=true

# Copy package manifests and production dependencies
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/
COPY apps/worker/package.json ./apps/worker/

RUN npm ci --omit=dev

# Copy compiled outputs from builder
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/server/dist ./apps/server/dist

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "apps/server/dist/index.js"]
