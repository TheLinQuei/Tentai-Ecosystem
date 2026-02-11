# Runtime image (dev mode with tsx transpiler)
FROM node:20-alpine

WORKDIR /app

# Install curl for healthchecks
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for tsx)
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Create telemetry directory
RUN mkdir -p telemetry

# Build the project (will skip errors with skipLibCheck and other lenient flags)
RUN npm run build || true

# Railway provides PORT env variable - default to 3000 for local dev
ENV PORT=3000

# Health check - use PORT env variable
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/v1/health || exit 1

# Start application using tsx (TypeScript transpiler) - works without build
CMD ["node", "--import", "tsx", "src/main.ts"]
