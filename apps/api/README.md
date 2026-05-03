# URBANUS API

> **Status:** Active
> FastAPI service for the URBANUS workspace.

## Summary

- Backend API for URBANUS project persistence, elevation enrichment, node extraction, and sewer-network processing.
- Solves the server-side parts that should not live in the browser: PostGIS persistence, graph processing, and Python geospatial orchestration.
- Main stack: FastAPI, Pydantic 2, SQLAlchemy async, asyncpg, GeoAlchemy, NetworkX, Shapely, Rasterio, NumPy, and `urbanus-geo`.
- Current status: active and consumed by `apps/web` through same-origin Next.js routes and local API scripts.
- Technical value: keeps the edited graph processing contract in one backend entrypoint while sharing geospatial constants with the workspace.

Python API package for project persistence, elevation enrichment, graph node extraction, and sewer-network processing. It is consumed by the web app through the monorepo's local API flow.

## Features

- Project create, list, read, and delete endpoints.
- Optional persistence of processed sewer-network snapshots.
- GeoJSON elevation enrichment.
- Node extraction from enriched street geometry.
- Processing pipeline for graph sanitization, extrema detection, routing, and accessory assignment.

## Tech Stack

- Python 3.11+
- FastAPI
- Pydantic 2
- SQLAlchemy async, asyncpg, GeoAlchemy
- NetworkX, Shapely, Rasterio, NumPy
- Workspace dependency on `urbanus-geo`

## Getting Started

Install dependencies from the monorepo root so the workspace package source is resolved correctly. This package does not define standalone console scripts in `pyproject.toml`.

## Usage

Important routes are declared in `src/urbanus_api/main.py`:

- `POST /projects`
- `GET /projects`
- `GET /projects/{project_id}`
- `DELETE /projects/{project_id}`
- `POST /nodes/extract`
- `POST /projects/{project_id}/process`
- `POST /elevation/enrich`

## Project Structure

```text
apps/api/
├── pyproject.toml
├── Dockerfile
└── src/urbanus_api/
    ├── main.py
    ├── models.py
    ├── data/
    ├── services/
    └── core/
```

## Architecture

`main.py` exposes the FastAPI routes and coordinates repositories, elevation services, graph classification, graph sanitization, optimizer steps, and routing helpers. Database access is isolated under `data/`, while shared geospatial math and constants come from the workspace package `urbanus-geo`.

## Technical Highlights

- API models use Pydantic 2.
- Project rows are converted back into API response objects before returning to the web app.
- Processing keeps edited sewer-network data as part of the project persistence contract.
