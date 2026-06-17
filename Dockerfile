# syntax=docker/dockerfile:1

FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" bunx prisma generate

FROM oven/bun:1-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/generated ./generated
COPY package.json bun.lock ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY index.ts ./
COPY src ./src
COPY tests ./tests

EXPOSE 3000
CMD ["bun", "run", "index.ts"]
