# Runtime image (dev mode with tsx transpiler)
FROM node:20-alpine

WORKDIR /app

# Install curl for healthchecks and docker client for orchestration
RUN apk add --no-cache curl docker-cli docker-cli-compose

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for tsx)
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Copy public assets
COPY public ./public

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=5s --timeout=5s --retries=5 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start application using tsx (TypeScript transpiler)
CMD ["npm", "run", "dev"]
