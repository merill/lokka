FROM node:20-alpine AS builder

WORKDIR /build

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ---

FROM node:20-alpine AS runtime

WORKDIR /app

RUN addgroup -S eligraph && adduser -S eligraph -G eligraph

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /build/build ./build

RUN mkdir -p /app/logs && chown -R eligraph:eligraph /app

USER eligraph

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "build/server.js"]
