# Multi-stage build for optimal image size
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --only=production=false

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Production stage
FROM node:20-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S bitcoin-api -u 1001

# Set working directory
WORKDIR /app

# Copy built application and production dependencies
COPY --from=builder --chown=bitcoin-api:nodejs /app/dist ./dist
COPY --from=builder --chown=bitcoin-api:nodejs /app/node_modules ./node_modules
COPY --chown=bitcoin-api:nodejs package*.json ./
COPY --chown=bitcoin-api:nodejs README.md ./

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown -R bitcoin-api:nodejs /app/data

# Security: Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Security hardening
RUN apk update && apk upgrade
RUN apk add --no-cache ca-certificates
RUN update-ca-certificates

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/metered-api.db

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const http = require('http'); \
  const options = {hostname: 'localhost', port: 3000, path: '/health', method: 'GET'}; \
  const req = http.request(options, (res) => { \
    if (res.statusCode === 200) process.exit(0); \
    else process.exit(1); \
  }); \
  req.on('error', () => process.exit(1)); \
  req.end();"

# Switch to non-root user
USER bitcoin-api

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/server.js"]

# Labels for metadata
LABEL org.opencontainers.image.title="Bitcoin Metered API"
LABEL org.opencontainers.image.description="Pay-per-request API using Bitcoin L2 (Arkade)"
LABEL org.opencontainers.image.vendor="Bitcoin Metered API"
LABEL org.opencontainers.image.source="https://github.com/oozle/bitcoin-metered-api"
LABEL org.opencontainers.image.documentation="https://github.com/oozle/bitcoin-metered-api#readme"
LABEL org.opencontainers.image.licenses="MIT"