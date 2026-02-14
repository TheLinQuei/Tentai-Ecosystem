# Multi-stage Dockerfile for ViMemory storage service
# Production-optimized build for Fly.io deployment

# -----------------------------------------------------------
# Stage 1: Base image with pnpm
# -----------------------------------------------------------
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

# -----------------------------------------------------------
# Stage 2: Install dependencies
# -----------------------------------------------------------
FROM base AS deps
WORKDIR /app

# Copy workspace configuration
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Bring in workspace packages and app sources for proper workspace install
COPY packages ./packages
COPY apps/memory ./apps/memory

# Install all dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --no-frozen-lockfile

# -----------------------------------------------------------
# Stage 3: Build memory service
# -----------------------------------------------------------
FROM deps AS builder
WORKDIR /app

# Copy additional build config if needed
COPY tsconfig.json ./

# Build memory and workspace dependencies
RUN pnpm --filter @vi/memory build && \
    pnpm --filter @vi/sdk build

# -----------------------------------------------------------
# Stage 4: Production runtime
# -----------------------------------------------------------
FROM node:22-alpine AS production
WORKDIR /app

# Install pnpm in production image
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create non-root user
RUN addgroup -g 1001 -S vibot && \
    adduser -S vibot -u 1001


# Copy built artifacts and dependencies
COPY --from=builder --chown=vibot:vibot /app/apps/memory/dist ./apps/memory/dist
COPY --from=builder --chown=vibot:vibot /app/apps/memory/package.json ./apps/memory/
COPY --from=builder --chown=vibot:vibot /app/packages ./packages
COPY --from=builder --chown=vibot:vibot /app/package.json ./

# Install only production dependencies for memory in runtime image
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --no-frozen-lockfile --filter @vi/memory...

# Switch to non-root user
USER vibot

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://localhost:4311/health').then(r=>r.ok||process.exit(1)).catch(()=>process.exit(1))"

# Expose Fastify port
EXPOSE 4311

# Start memory service
CMD ["node", "apps/memory/dist/index.js"]
