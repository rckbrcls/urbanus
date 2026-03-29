.PHONY: dev dev-web dev-api build lint type-check install test test-ts test-py

install:
	pnpm install
	uv sync

dev:
	$(MAKE) dev-web & $(MAKE) dev-api & wait

dev-web:
	pnpm turbo run dev --filter @urbanus/web

dev-api:
	cd apps/api && env $$(grep -v '^#' ../../.env | xargs) uv run uvicorn urbanus_api.main:app --reload --host 0.0.0.0 --port 8000

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
