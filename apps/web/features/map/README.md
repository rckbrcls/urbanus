# URBANUS Map Feature

> **Status:** Active
> Feature folder for URBANUS map-specific services, validators, hooks, types, and serialization tests.

## Summary

- Contains the browser-side map domain layer used by the URBANUS web app.
- Solves the problem of keeping map services, node validation, elevation sync, and graph serialization separate from page-level React code.
- Main features include street/elevation services, node services, bounding-box validation, node validation, history/selection hooks, and serialization tests.
- Main stack: TypeScript, React hooks, Vitest, and workspace imports from the URBANUS web app.
- Current status: active, but the visible map UI now lives mostly in `apps/web/components/map` and product panels; this folder is the map support layer.

## Overview

`features/map` is not a standalone app. It is a feature module imported by the URBANUS web app to keep map-related domain behavior colocated. The folder owns services and types for street data, nodes, elevation, bounding boxes, validation, and editor serialization.

## Features

- `NodesApiService`, `NodesService`, `StreetsService`, `ElevationService`, and `BoundingBoxService`.
- Node and bounding-box validators with colocated Vitest tests.
- Hooks for node selection, node history, elevation synchronization, and node state.
- Map and graph-facing TypeScript types.
- Utility helpers for retry, rate limiting, throttling, and colocated geometry behavior.
- `serialization.test.ts` for checking map state serialization behavior.

## Tech Stack

- TypeScript
- React hooks
- Vitest
- URBANUS shared packages and app-local map helpers

## Usage

Import through the feature barrel when possible:

```ts
import { NodesService, BboxValidator } from "@/features/map";
```

The feature should stay UI-light. Page and panel composition belongs in `apps/web/app`, `apps/web/components/map`, and `apps/web/components/panels`.

## Project Structure

```text
features/map/
├── components/       # Small map-specific UI helpers still colocated here
├── constants/        # Map constants
├── hooks/            # Node, selection, history, and elevation hooks
├── services/         # Node, street, elevation, API, and bbox services
├── types/            # Map, bbox, node, and elevation types
├── utils/            # Retry, rate-limit, throttle, and colocated helpers
├── validators/       # Node and bbox validators plus tests
├── index.ts          # Public feature exports
└── serialization.test.ts
```

## Architecture

### Main Components

- `services/`: performs map-domain operations and API-oriented transformations.
- `validators/`: keeps node and bbox rules testable outside React components.
- `hooks/`: wraps client-side map state behavior for consuming components.
- `types/`: centralizes TypeScript contracts used by map services and UI.

### Data Flow

Map components call hooks and services from this folder, services normalize or validate map data, and higher-level app routes/components decide when to persist or process project state through the web/API layers.

### Key Design Choices

- Keep service logic testable without rendering the full map.
- Keep reusable map contracts in feature-local types.
- Keep this folder as a support layer, not a second routing or page system.

## Known Limitations

- This README documents the current file layout, not every consuming component.
- Some map UI components live outside this folder, so check `apps/web/components/map` and `apps/web/components/panels` before assuming ownership.
