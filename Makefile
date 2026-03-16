.PHONY: dev dev-web dev-api build lint type-check install

install:
	pnpm install
	uv sync

dev:
	$(MAKE) dev-web & $(MAKE) dev-api & wait

dev-web:
	pnpm turbo run dev --filter @urbanus/web

dev-api:
	cd apps/api && uv run uvicorn urbanus_api.main:app --reload --host 0.0.0.0 --port 8000

build:
	pnpm turbo run build

lint:
	pnpm turbo run lint
	cd apps/api && uv run ruff check .

type-check:
	pnpm turbo run type-check
