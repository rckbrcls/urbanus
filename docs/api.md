# API Documentation

## Overview

URBANUS exposes a FastAPI backend and a Next.js frontend API layer. The frontend routes in `apps/web/app/api/` proxy browser-facing calls to the Python API through `PYTHON_API_URL`.

## Frontend Proxy Routes

Detected Next.js API route groups include:

- `projects`
- `projects/[id]`
- `projects/[id]/process`
- `nodes/extract`
- `elevation/enrich`

These routes should stay aligned with the FastAPI backend contract.

## Backend Responsibilities

The FastAPI app is responsible for:

- project persistence;
- graph extraction and processing;
- elevation enrichment;
- database access through `DATABASE_URL`;
- returning graph/network data consumed by the map editor.

## Authentication

No authentication layer was documented in the scanned route surfaces. Confirm the intended access model before exposing the API outside local development.

## Notes

- Keep provider keys server-side.
- Update this file when FastAPI route paths are formalized or exposed externally.
- Prefer examples backed by real route names and request schemas from `apps/api`.
