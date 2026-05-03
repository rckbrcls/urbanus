# Architecture

## Overview

URBANUS is a monorepo for urban infrastructure graph processing. The web app owns the interactive editing surface, the FastAPI backend owns project persistence and processing orchestration, and shared packages keep geometry and constants consistent across TypeScript and Python.

## Goals

- Keep graph processing explicit and reproducible.
- Preserve edited network state as the supported processing input.
- Keep map/editor behavior aligned with backend contracts.
- Share geometry and validation rules instead of duplicating them per surface.

## System Components

### Frontend

`apps/web/` is the Next.js product surface. It contains the project workspace, map editor, same-origin API routes, i18n dictionaries, UI components, and MapLibre rendering logic.

### Backend

`apps/api/` is the FastAPI service. It handles project APIs, graph extraction, elevation enrichment, processing, persistence, and database access.

### Shared TypeScript Packages

`packages/constants`, `packages/geo`, and `packages/utils` keep shared contracts and helper logic available to frontend code.

### Shared Python Package

`py/urbanus-geo/` contains Python geometry, elevation, and calculation helpers used by backend processing and tested independently.

### Database

PostgreSQL stores project and graph-processing data. The API reads `DATABASE_URL` from the environment.

## Data Flow

1. The user creates or opens a project in the web app.
2. The map/editor surface extracts or edits network data.
3. Frontend API routes call FastAPI through `PYTHON_API_URL`.
4. FastAPI validates, enriches, processes, and persists graph data.
5. The web app renders the returned project/network state.

## Security Model

- Database credentials are supplied by environment variables.
- Browser-facing calls should go through same-origin Next.js API routes when possible.
- External elevation provider keys must not be exposed to the browser.
- Processing actions should operate on the supported edited graph contract.

## Trade-offs

- A monorepo keeps contracts close, but requires frontend/backend changes to stay synchronized.
- Keeping heavy graph work in the backend protects the client from processing complexity, but makes API contract documentation important.
- Optional provider-based elevation improves data quality, but requires fallback behavior when credentials are absent.

## Future Improvements

- Add endpoint-level examples once the public API contract stabilizes.
- Add screenshots of the project list, editor, and processing flow.
- Document the database schema in a dedicated data-model guide if it becomes part of external onboarding.
