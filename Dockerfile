FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g bun@1.3.14

WORKDIR /app

COPY package.json bun.lock turbo.json tsconfig.json tsconfig.base.json prisma.config.ts ./
COPY apps ./apps
COPY packages ./packages
COPY prisma ./prisma

RUN bun install --frozen-lockfile
RUN bun run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "run", "start:railway"]
