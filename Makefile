.PHONY: dev dev-web dev-api build lint type-check install test test-ts test-py

install:
	pnpm install
	uv sync

dev:
	pnpm dev

dev-web:
	pnpm --filter @urbanus/web dev

dev-api:
	cd apps/api && exec uv run --env-file ../../.env uvicorn urbanus_api.main:app --reload --host 0.0.0.0 --port 8000

build:
	pnpm turbo run build

lint:
	pnpm turbo run lint
	cd apps/api && uv run ruff check .

type-check:
	pnpm turbo run type-check

test: test-ts test-py

test-ts:
	pnpm turbo run test

test-py:
	cd py/urbanus-geo && uv run pytest tests/ -v
	cd apps/api && uv run pytest tests/ -v
