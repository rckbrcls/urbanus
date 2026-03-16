FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/geo/package.json packages/geo/
COPY packages/constants/package.json packages/constants/
COPY packages/utils/package.json packages/utils/

RUN pnpm install --frozen-lockfile

COPY . .

WORKDIR /app/apps/web

EXPOSE 3000

CMD ["pnpm", "dev"]
