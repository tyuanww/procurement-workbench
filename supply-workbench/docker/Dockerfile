FROM node:24-bookworm AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.28.2 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY docker ./docker
COPY tsconfig.base.json tsconfig.json ./
RUN pnpm install --frozen-lockfile && pnpm build && pnpm --filter @sw/web build && node --experimental-strip-types docker/use-dist.ts

FROM node:24-bookworm
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.28.2 --activate
COPY --from=build /app /app
RUN pnpm --filter @sw/report-renderers exec playwright install --with-deps chromium
ENV NODE_ENV=production
ENV UPLOAD_DIR=/data/uploads
CMD ["node", "--experimental-strip-types", "--import", "./docker/register.mts", "docker/start.ts"]
