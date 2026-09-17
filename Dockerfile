# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_REALTIME_URL
ENV NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL
RUN --mount=type=secret,id=env,target=/app/.env npx prisma generate
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000 3001
RUN chown -R node:node /app/.next
USER node
CMD ["npm","run","start"]
