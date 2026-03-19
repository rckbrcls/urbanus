FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm

# Copy workspace manifests + lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/geo/package.json packages/geo/
COPY packages/constants/package.json packages/constants/
COPY packages/utils/package.json packages/utils/

# Copy all source (workspace packages + app)
COPY packages/ packages/
COPY apps/web/ apps/web/

# Install deps (inside container, after all source is copied)
RUN pnpm install --frozen-lockfile

WORKDIR /app/apps/web

EXPOSE 3000

CMD ["pnpm", "dev"]
