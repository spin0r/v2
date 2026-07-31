# ── Build stage ──
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Production stage ──
FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built frontend + server code
COPY --from=builder /app/dist ./dist
COPY web-api.ts ./
COPY src/server ./src/server
COPY src/core ./src/core
RUN mkdir -p data

ENV NODE_ENV=production
ENV WEB_API_PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["npx", "tsx", "web-api.ts"]
