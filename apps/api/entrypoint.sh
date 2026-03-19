#!/bin/sh
set -e

echo "Running database migrations..."
uv run alembic upgrade head
echo "Migrations complete. Starting server..."

exec uv run uvicorn urbanus_api.main:app --reload --host 0.0.0.0 --port 8000
