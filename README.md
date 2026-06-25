# URBANUS

> Academic research prototype for preliminary sanitary sewer planning in low-income urban areas.

## Summary

URBANUS is a web-based decision-support platform for the preliminary design of sanitary sewer collection networks. The system combines public geospatial data, editable graph modeling, topographic enrichment, and graph algorithms to help specialists evaluate sewer-network layouts before detailed engineering design.

The repository is organized as a polyglot monorepo with a Next.js web application, a FastAPI/PostGIS backend, shared TypeScript packages, and a shared Python geospatial package. The current implementation focuses on the map-based workflow: selecting an urban area, importing streets, enriching vertices with elevation, editing the graph, processing the sewer network, and saving the result for later inspection.

## Academic Context

The project is part of an undergraduate research effort at the University of Sao Paulo (USP) focused on making sanitation infrastructure planning more accessible for municipalities and technical teams working in low-income urban areas.

The research documents in `docs/` describe the scientific motivation and validation path:

- `docs/relatorio-parcial/main.tex` documents the undergraduate research report, including the system architecture, implementation progress, and planned experimental validation.
- `docs/_SBBD2026_DS4SG__Urbanus/` contains the SBBD DS4SG paper materials, including the method, related work, experiments, references, and figures.
- `docs/tcc-carmem.pdf` provides background material for the original sanitation-planning problem and the Verdelandia/MG case study.

The documented case study in Barreiro do Rio Verde, Verdelandia/MG, compares manual specialist planning with the URBANUS-assisted workflow. For the same 242 street alignments, the system data-entry and processing time was approximately 41 seconds. The evaluation also reports 100% precision for the step that enforces minimum spacing between inspection manholes and 89.5% precision for the step that clusters nearby corner nodes.

## Research Motivation

Sanitary sewer planning in low-income urban areas is constrained by cost, time, technical complexity, and access to specialized tools. Before construction, teams must analyze the street network, evaluate topography, identify feasible flow directions, position inspection structures, estimate sewage contribution, and compare alternatives.

URBANUS addresses the preliminary planning stage. It does not replace an executive engineering project. Instead, it provides a computational base for exploring feasible layouts, reducing manual transcription work, and allowing domain specialists to inspect and refine the result before later technical validation.

## Current Workflow

1. Create or open a project in the web interface.
2. Select an area on the map.
3. Fetch street geometry from OpenStreetMap through the Overpass API.
4. Enrich street vertices with elevation data from OpenTopography.
5. Inspect and edit the resulting graph.
6. Run the sewer-network processing pipeline.
7. Review flow direction, collection points, elevations, and processed edges.
8. Save and reload the processed sewer-network snapshot with the project.

## Main Features

- Project creation, listing, loading, deletion, and processed network persistence.
- Map-based bounding-box selection with area validation.
- Street import through a Next.js API route that queries Overpass API.
- Elevation enrichment through the FastAPI backend and OpenTopography.
- Interactive graph editing with node selection, movement, creation, connection, splitting, removal, undo, and redo.
- Sewer processing from the edited graph as the source of truth.
- Repeated Shortest Path Heuristic (RSPH) routing for gravitational sewer-network layout.
- Graph sanitization, direction-change handling, elevation extrema detection, coverage repair, cycle prevention, node reduction, and accessory assignment.
- PostGIS persistence for projects, selected areas, graph geometries, and processed sewer-network data.
- Shared TypeScript and Python geospatial packages with parity tests for aligned domain behavior.

## Research Module: Building Detection

The SBBD paper also documents a building-detection research module for improving sewage contribution estimates from satellite imagery. The experiments compare fine-tuned SAM and DeepLab V3 segmentation models on the Massachusetts Buildings Dataset.

The reported results show that SAM improved from 0.160 to 0.586 mean IoU after fine-tuning, while DeepLab V3 improved from 0.177 to 0.600 mean IoU and reached 0.747 mean Dice. This module is documented as part of the research validation and future integration path. The main application workflow in this repository currently centers on street extraction, elevation enrichment, graph editing, and sewer-network processing.

## Screenshots

Representative interface captures are available under `images/`.

![Project creation screen](images/starting-project.png)

![Area selection over the map](images/bounding-box-draw.png)

![Processed sewer-network view](images/small-case-after-processing.png)

## Tech Stack

- **Frontend:** Next.js App Router, React 19, TypeScript, MapLibre GL, `react-map-gl`, TanStack Query, Zustand, Radix/Base UI primitives, Tailwind CSS.
- **Backend:** FastAPI, Pydantic 2, SQLAlchemy async, asyncpg, GeoAlchemy, PostGIS, NetworkX, Shapely, Rasterio, NumPy, httpx.
- **Shared TypeScript packages:** pnpm workspaces, Turborepo, Vitest, `@urbanus/geo`, `@urbanus/constants`, `@urbanus/utils`.
- **Shared Python package:** uv workspace, Hatchling, pytest, `urbanus-geo`.
- **Infrastructure:** Docker Compose with `postgis/postgis:16-3.4`.

## Repository Structure

```text
URBANUS/
├── apps/
│   ├── api/          # FastAPI service, SQLAlchemy models, geospatial persistence, graph pipeline
│   └── web/          # Next.js app, map editor, project pages, API proxy routes
├── packages/
│   ├── constants/    # Shared TypeScript constants
│   ├── geo/          # Shared TypeScript geospatial types and calculations
│   └── utils/        # Shared retry, throttle, and rate-limit helpers
├── py/
│   └── urbanus-geo/  # Shared Python geospatial types and calculations
├── docs/             # Research reports, paper sources, references, and figures
├── images/           # Interface and experiment screenshots
├── docker-compose.yml
├── pnpm-workspace.yaml
├── pyproject.toml
└── turbo.json
```

## Architecture

### Frontend

The web application owns the interactive workflow. It provides the project list, map editor, graph-editing controls, visualization layers, result panels, and API proxy routes.

Important areas:

- `apps/web/app`: App Router pages and API routes.
- `apps/web/components`: application UI, map components, project cards, and shared UI primitives.
- `apps/web/features/map`: map services, hooks, validators, constants, and graph-editing helpers.
- `apps/web/stores`: local state for projects, map state, area selection, graph editing, and pipeline results.
- `apps/web/types/sewer.ts`: TypeScript representation of the processed sewer-network payload.

### Backend

The FastAPI service owns persistence, elevation enrichment, node extraction, and sewer-network processing. It reconstructs the edited graph, applies the processing pipeline, serializes the result, and saves spatial data in PostGIS.

Important areas:

- `apps/api/src/urbanus_api/main.py`: API routes and processing orchestration.
- `apps/api/src/urbanus_api/models.py`: Pydantic request and response models.
- `apps/api/src/urbanus_api/data`: SQLAlchemy engine, tables, repositories, and PostGIS persistence.
- `apps/api/src/urbanus_api/services/elevation.py`: OpenTopography GeoTIFF retrieval and elevation sampling.
- `apps/api/src/urbanus_api/core`: graph classification, sanitization, coverage repair, elevation extrema, routing, and optimization modules.

### Shared Packages

The project shares contracts rather than implementations. TypeScript and Python each keep their own implementations, while common concepts stay aligned through types, constants, tests, and parity checks.

- `packages/geo`: TypeScript geospatial types, calculations, clipping, and validations.
- `packages/constants`: shared TypeScript constants for area limits, defaults, rate limits, node colors, hydraulics, and pipeline parameters.
- `packages/utils`: pure TypeScript utilities for retry, throttle, and rate limiting.
- `py/urbanus-geo`: Python geospatial types, constants, and calculations used by the backend.

## Data Flow

1. The browser sends the selected bounding box to the Next.js `/api/streets` route.
2. The route queries Overpass API, clips the response to the selected area, and returns GeoJSON.
3. The web app sends street geometry to the elevation route, which proxies the request to FastAPI.
4. FastAPI fetches a GeoTIFF from OpenTopography and samples elevation at street vertices.
5. The frontend builds and edits the graph from the enriched street geometry.
6. The edited graph is sent to `POST /projects/{project_id}/process`.
7. FastAPI rebuilds the graph with NetworkX, applies the sewer pipeline, and returns a serialized sewer network.
8. The project and processed network are persisted in PostgreSQL/PostGIS and can be reloaded later.

## Sewer Processing Pipeline

The current backend pipeline follows the method described in the research documents:

1. Identify mandatory nodes, including intersections, dead ends, explicit collection points, and relevant graph structures.
2. Detect direction changes that require preserved inspection points.
3. Subdivide long or steep edges when necessary.
4. Remove redundant nodes while preserving relevant geometry and technical constraints.
5. Detect local elevation maxima and minima.
6. Detect grade breaks and select collection points.
7. Run RSPH gravitational routing.
8. Repair missing edge coverage and prevent invalid cycles when needed.
9. Reduce nodes and assign inspection accessories to the final physical nodes.

The process endpoint uses the edited graph sent by the frontend. This keeps the backend result aligned with the structure that the user inspected and adjusted in the interface.

## API Overview

Important FastAPI routes:

- `POST /projects`
- `GET /projects`
- `GET /projects/{project_id}`
- `DELETE /projects/{project_id}`
- `POST /nodes/extract`
- `POST /projects/{project_id}/process`
- `POST /elevation/enrich`

Important Next.js routes:

- `/`
- `/map`
- `/projects`
- `/projects/[id]`
- `/api/projects`
- `/api/projects/[id]`
- `/api/projects/[id]/process`
- `/api/streets`
- `/api/elevation/enrich`

## Requirements

- Node.js compatible with the checked-in Next.js and React versions.
- pnpm, as declared by `packageManager` in `package.json`.
- uv for the Python workspace.
- PostgreSQL/PostGIS, either local or through Docker Compose.
- Docker and Docker Compose for the included local infrastructure stack.

## Installation

Install JavaScript and Python dependencies from the repository root:

```bash
pnpm install
uv sync
```

The Python API declares `urbanus-geo` as a workspace source in `apps/api/pyproject.toml`, so root-level installation keeps the local Python packages aligned.

## Environment Variables

- `DATABASE_URL`: async SQLAlchemy URL for PostGIS. The local default in code is `postgresql+asyncpg://urbanus:urbanus@localhost:5432/urbanus`.
- `OPENTOPOGRAPHY_API_KEY`: key used by OpenTopography elevation enrichment.
- `PYTHON_API_URL`: backend URL used by the Next.js API layer. Docker Compose sets it to `http://server:8000`; local code defaults to `http://localhost:8000`.

## Running Locally

Root-level scripts:

```bash
pnpm dev
pnpm dev:web
pnpm dev:api
```

Makefile orchestration:

```bash
make install
make dev
make dev-web
make dev-api
```

Docker Compose stack:

```bash
docker compose up
```

## Validation

Documented checks:

```bash
pnpm lint
pnpm type-check
pnpm test
```

The TypeScript workspace uses Vitest. The Python API and Python geospatial package use pytest. Package-level READMEs document additional local checks when working inside a specific package.

## Current Status

The current implementation provides the functional basis of the URBANUS web version:

- project persistence;
- street import;
- elevation enrichment;
- graph editing;
- processing from the edited graph;
- processed-network visualization;
- PostGIS persistence;
- automated tests for central geospatial and graph-processing components.

The main remaining research work is broader experimental validation across different urban areas, refinement of quality metrics, and tighter integration between the sewer-routing workflow and the building-detection research module.

## Known Limitations

- The system supports preliminary planning and still requires specialist review before any engineering use.
- Elevation enrichment depends on OpenTopography availability and credentials.
- The building-detection module is documented in the research material, but it is not yet the central workflow of the current web application.
- Experimental validation beyond the documented case study is still ongoing.
- Production deployment details are not documented beyond the included Docker Compose stack.

## References and Project Documents

- Undergraduate research report: `docs/relatorio-parcial/main.tex`
- SBBD DS4SG paper source: `docs/_SBBD2026_DS4SG__Urbanus/main.tex`
- SBBD references: `docs/_SBBD2026_DS4SG__Urbanus/references.bib`
- Original sanitation-planning background material: `docs/tcc-carmem.pdf`
