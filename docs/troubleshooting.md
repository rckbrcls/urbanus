# Troubleshooting

## API cannot connect to the database

Symptoms:

- Project list or processing routes fail.
- FastAPI returns database connection errors.

Checks:

- Confirm `DATABASE_URL` in `.env`.
- Confirm PostgreSQL is running and reachable.
- Confirm migrations/schema setup are aligned with the current backend.

## Frontend cannot reach the API

Symptoms:

- Browser routes load but project actions fail.
- Same-origin API routes return connection errors.

Checks:

- Confirm `PYTHON_API_URL` points to the FastAPI server.
- Confirm the backend port matches the Makefile/script configuration.
- Inspect `apps/web/app/api/*` route handlers when changing backend paths.

## Elevation enrichment does not return provider data

Symptoms:

- Elevation values are missing or fallback-like.

Checks:

- `OPENTOPOGRAPHY_API_KEY` is optional but required for provider-backed enrichment.
- Confirm the key is set only in server-side environment files.
- Confirm the requested area is supported by the provider.

## Tests fail after contract changes

Checks:

- TypeScript tests run through the workspace test target.
- Python tests exist in `py/urbanus-geo/tests` and `apps/api/tests`.
- Update shared constants/types and backend schemas together when graph semantics change.
