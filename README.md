# URBANUS

> **Status:** Active
> Monorepo for a browser-based urban infrastructure analysis and sewer-network planning tool.

## Summary

- URBANUS is a geospatial web platform for selecting urban areas, importing street geometry, enriching elevation data, editing graph nodes, and processing sewer-network layouts.
- The active product is a pnpm/Turborepo monorepo with a Next.js web app, a FastAPI/PostGIS backend, shared TypeScript packages, and a shared Python geospatial package.
- The main workflow is map-first: create or open a project, fetch streets, enrich elevation, edit the graph, run the sewer processing pipeline, and persist the processed network.
- The technical core combines MapLibre/React UI state, same-origin Next.js API routes, FastAPI services, SQLAlchemy async persistence, PostGIS geometry columns, NetworkX/Shapely graph processing, and shared parity-tested constants.
- Current status is active, but the README was rewritten to match the current `apps/web` + `apps/api` workspace instead of older `client/server`, MongoDB, and Leaflet-era documentation.

## Overview

URBANUS helps explore urban street networks as editable graphs. The web app owns the map and editor experience, while the Python API handles persistence, elevation enrichment, node extraction, and sewer-network processing. Shared packages keep calculations, constants, and utility helpers aligned across TypeScript and Python.

The repository also contains research and project documents in `docs/` and root-level PDF assets. The runtime code lives primarily under `apps/`, `packages/`, and `py/`.

## Motivation

The project is valuable as both an infrastructure-planning prototype and a portfolio-grade full-stack geospatial system. It demonstrates how to combine browser map editing, typed shared packages, Python graph algorithms, and spatial database persistence without leaving the workflow trapped in notebooks or one-off scripts.

## Features

- Project creation, listing, loading, deletion, and processed network persistence.
- Map-based area selection and street import through a Next.js route that queries Overpass API.
- Elevation enrichment through the FastAPI backend and optional OpenTopography API credentials.
- Interactive node and edge editing with graph serialization and editor history helpers.
- Sewer processing endpoint for sanitization, extrema handling, routing, accessory assignment, and unreachable-node reporting.
- Shared TypeScript packages for geospatial helpers, constants, and retry/rate-limit utilities.
- Shared Python `urbanus-geo` package for geospatial calculations, domain types, constants, and parity tests.
- Docker Compose stack for the web app, API, and PostGIS database.

## Tech Stack

- **Frontend:** Next.js App Router, React 19, TypeScript, MapLibre GL, `react-map-gl`, TanStack Query, Zustand, Radix/Base UI primitives, Tailwind CSS.
- **Backend:** FastAPI, Pydantic 2, SQLAlchemy async, asyncpg, GeoAlchemy, PostGIS, NetworkX, Shapely, Rasterio, NumPy, httpx.
- **Shared packages:** pnpm workspaces, Turborepo, Vitest, `@urbanus/geo`, `@urbanus/constants`, `@urbanus/utils`.
- **Python workspace:** uv, Hatchling, pytest, `urbanus-geo`.
- **Infrastructure:** Docker Compose with `postgis/postgis:16-3.4`.

## Screenshots / Demo

Screenshots are expected under `screenshots/`. That folder currently contains a placeholder checklist, so the main README should be updated with image links once representative UI captures exist.

## Getting Started

### Requirements

- Node.js compatible with the checked-in Next.js and React versions.
- pnpm, as declared by `packageManager` in `package.json`.
- uv for the Python workspace and API development flow.
- Docker and Docker Compose if using the included PostGIS stack.
- PostgreSQL/PostGIS available locally or through Docker Compose.

### Installation

```bash
pnpm install
uv sync
```

The Python API declares `urbanus-geo` as a workspace source in `apps/api/pyproject.toml`, so install from the repository root when possible.

### Environment Variables

- `DATABASE_URL`: async SQLAlchemy URL for PostGIS. The local default in code is `postgresql+asyncpg://urbanus:urbanus@localhost:5432/urbanus`.
- `OPENTOPOGRAPHY_API_KEY`: optional key used by elevation enrichment.
- `PYTHON_API_URL`: backend URL used by the Next.js API layer. Docker Compose sets it to `http://server:8000`; local code defaults to `http://localhost:8000`.

### Running Locally

Documented scripts from `package.json`:

```bash
pnpm dev
pnpm dev:web
pnpm dev:api
```

Docker Compose also defines `client`, `server`, and `postgres` services:

```bash
docker compose up
```

Agent note: do not run dev, build, preview, or production commands in this environment; document them for a human to run.

### Running Tests

Documented scripts and test surfaces:

```bash
pnpm test
pnpm lint
pnpm type-check
```

The TypeScript workspace uses Vitest. The Python geospatial package has pytest tests under `py/urbanus-geo/tests/`. Package-level READMEs document additional local checks.

## Usage

1. Open the web app and create or load a project.
2. Select an area on the map and fetch street geometry.
3. Enrich the geometry with elevation data when credentials and data are available.
4. Inspect and edit the graph nodes and sewer-network state.
5. Run the processing pipeline through the project process endpoint.
6. Persist and reload the processed `sewerNetwork` snapshot as part of the project.

Important API routes in `apps/api/src/urbanus_api/main.py`:

- `POST /projects`
- `GET /projects`
- `GET /projects/{project_id}`
- `DELETE /projects/{project_id}`
- `POST /nodes/extract`
- `POST /projects/{project_id}/process`
- `POST /elevation/enrich`

Important web routes:

- `/`
- `/map`
- `/projects`
- `/projects/[id]`
- `/api/projects`
- `/api/streets`

## Project Structure

```text
URBANUS/
├── apps/
│   ├── api/          # FastAPI service, SQLAlchemy models, graph pipeline, elevation services
│   └── web/          # Next.js app, map editor, project pages, same-origin API routes
├── packages/
│   ├── constants/    # Shared TypeScript constants
│   ├── geo/          # Shared TypeScript geospatial helpers
│   └── utils/        # Shared retry, throttle, and rate-limit helpers
├── py/
│   └── urbanus-geo/  # Shared Python geospatial package
├── docs/             # Project documentation and pipeline notes
├── screenshots/      # Placeholder for visual evidence
├── docker-compose.yml
├── pnpm-workspace.yaml
├── pyproject.toml
└── turbo.json
```

## Architecture

### Main Components

- `apps/web/app`: App Router pages and API routes.
- `apps/web/components` and `apps/web/features/map`: map editor UI, panels, validation, serialization, and map feature helpers.
- `apps/api/src/urbanus_api/main.py`: FastAPI route layer and orchestration entrypoint.
- `apps/api/src/urbanus_api/data`: SQLAlchemy engine, tables, repositories, and PostGIS persistence.
- `apps/api/src/urbanus_api/core`: graph classification, sanitization, optimization, elevation extrema, and RSPH routing helpers.
- `packages/*`: TypeScript workspace packages consumed by the web app.
- `py/urbanus-geo`: Python package consumed by the API.

### Data Flow

1. The browser requests streets through the Next.js `/api/streets` route.
2. The route calls Overpass API, clips the result to the selected bounding box, and returns GeoJSON.
3. The web editor stores and mutates graph state locally.
4. Project data is sent through same-origin web API routes to the FastAPI service.
5. The FastAPI service persists projects, nodes, edges, and processed sewer-network snapshots in PostGIS.
6. Processing uses the edited graph as the source of truth, then returns a serialized sewer-network result to the web app.

### Key Design Choices

- Keep browser calls to the Python service behind same-origin Next.js routes where possible.
- Keep map and editor behavior in TypeScript packages/components, and keep graph processing in the Python API.
- Share constants and geospatial calculations across packages, with parity tests where the same concepts exist in TypeScript and Python.
- Persist the processed `sewerNetwork` snapshot with the project so reloads can recover the processed state.

## Technical Highlights

- PostGIS tables use geometry columns for project bounds, centers, edges, and nodes.
- The process endpoint accepts the edited graph from the frontend rather than regenerating an unrelated backend-only graph.
- RSPH routing, graph sanitization, node reduction, extrema detection, and accessory assignment are separated into backend core modules.
- Translation blockers are expected in the web root layout so browser translation tools do not mutate the React DOM.
- Workspace scripts route app-specific work through pnpm filters and Turbo.

## Current Status

Active. The codebase is in a monorepo shape and the current README now matches the live layout. Some generated/cache artifacts are present in the working tree, but they are not part of the documented source structure.

## Roadmap

No formal roadmap file was found. Based on visible placeholders, the next documentation-focused tasks are adding screenshots, keeping the API route list synchronized, and documenting any production deployment process once it exists.

## Lessons Learned

- Large geospatial projects benefit from explicit package boundaries between UI state, shared calculations, backend orchestration, and persistence.
- Long READMEs can become harmful when they preserve old architecture; short, accurate documentation is more useful than exhaustive stale diagrams.
- Same-origin API routes reduce browser/runtime coupling and make local development easier to reason about.

## Known Limitations

- Screenshots are not committed yet.
- The README does not claim a production deployment path because no active deployment file beyond Docker Compose was found.
- OpenTopography-backed elevation enrichment depends on external API availability and credentials.
- Some historical files and generated cache directories may still exist in the checkout and should not be treated as current architecture without verification.
