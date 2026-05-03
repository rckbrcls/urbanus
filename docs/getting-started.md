# Getting Started

## Requirements

- Node.js compatible with the checked-in pnpm workspace.
- pnpm.
- Python with `uv`.
- PostgreSQL for the FastAPI persistence layer.
- Optional: an OpenTopography API key for elevation enrichment.

## Installation

From the repository root:

```bash
pnpm install
uv sync
```

The same steps are exposed by the Makefile:

```bash
make install
```

## Environment Setup

Copy `.env.example` to `.env` and adjust values for your local database:

```bash
cp .env.example .env
```

Important variables:

- `DATABASE_URL`: FastAPI database connection string.
- `PYTHON_API_URL`: backend URL used by web same-origin API routes.
- `OPENTOPOGRAPHY_API_KEY`: optional provider key for elevation enrichment.

## Running the Project

The repository scripts define these local workflows:

```bash
make dev
make dev-web
make dev-api
```

Equivalent pnpm scripts exist:

```bash
pnpm dev
pnpm dev:web
pnpm dev:api
```

## Running Tests

Use the Makefile targets when test execution is allowed:

```bash
make test
make test-ts
make test-py
```

The Python target runs tests in `py/urbanus-geo` and `apps/api`.

## Notes

- This environment did not run install, build, dev, or test commands during documentation.
- Confirm local PostgreSQL is available before relying on the API workflow.
