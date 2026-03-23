# Multi-stage build for Next.js app with Python API (Debian-based for Stockfish compatibility)
FROM node:18-slim AS base

# Install system dependencies
FROM base AS deps
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install Node dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Install Python dependencies
COPY api/requirements.txt ./api-requirements.txt
RUN pip3 install --no-cache-dir -r ./api-requirements.txt || pip3 install --no-cache-dir fastapi uvicorn python-chess cassandra-driver

# Build stage
FROM base AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y python3 python3-pip && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Production runner
FROM base AS runner
WORKDIR /app

# Install runtime dependencies: Python, wget for Stockfish download
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Explicitly download and setup Stockfish 16.1 (Linux x64)
# This matches the version expected by api/logic/engine.py
RUN wget https://github.com/official-stockfish/Stockfish/releases/download/sf_16.1/stockfish-ubuntu-x86-64-avx2.tar -O stockfish.tar \
    && tar -xvf stockfish.tar \
    && mv stockfish/stockfish-ubuntu-x86-64-avx2 /usr/bin/stockfish \
    && chmod +x /usr/bin/stockfish \
    && rm -rf stockfish stockfish.tar

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN groupadd --gid 1001 nodejs
RUN useradd --uid 1001 --gid nodejs --shell /bin/sh --create-home nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/api ./api
COPY --from=builder /app/src ./src

# Standalone output from Next.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Re-install python deps in runner
RUN pip3 install --no-cache-dir fastapi uvicorn python-chess cassandra-driver

USER nextjs

EXPOSE 3000
EXPOSE 8000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"
ENV STOCKFISH_PATH "/usr/bin/stockfish"

# Startup script to run both Next.js and Python API
RUN echo '#!/bin/sh\npython3 -m uvicorn api.index:app --host 0.0.0.0 --port 8000 & \nnode server.js' > /app/start.sh
RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]
