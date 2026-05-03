# urbanus-geo

> **Status:** Active
> Python geospatial calculation package for URBANUS.

## Summary

- Shared Python package for URBANUS geospatial calculations, domain constants, and typed sewer-network data structures.
- Solves backend reuse by keeping geometry and domain primitives outside FastAPI route code.
- Main stack: Python 3.11+, Pydantic 2, pytest, and Hatchling.
- Current status: active and consumed by `apps/api` through uv workspace sources.
- Technical value: includes parity tests that help keep Python and TypeScript geospatial behavior aligned.

Shared Python package for geospatial, geometry, hydraulic, and domain constants used by the API and validated with pytest.

## Features

- Haversine and geospatial calculations.
- Geometry helpers.
- Hydraulic calculation tests.
- Shared node and distance constants.

## Tech Stack

- Python 3.11+
- Pydantic 2
- pytest
- Hatchling

## Getting Started

Install this package through the URBANUS workspace so `apps/api` can resolve `urbanus-geo` as a workspace source.

## Project Structure

```text
py/urbanus-geo/
├── pyproject.toml
├── src/urbanus_geo/
│   ├── calculations.py
│   ├── constants.py
│   └── types.py
└── tests/
```

## Architecture

The API imports this package for calculations and constants that should remain independent from FastAPI route code. Tests include parity checks to keep important values aligned with the TypeScript geospatial layer.
