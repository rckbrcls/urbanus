# URBANUS Web

> **Status:** Active
> This app is currently maintained as the browser-based editor and dashboard for the URBANUS workspace.

## Summary

- Browser app for the URBANUS map editor, project list, project detail routes, and same-origin API layer.
- Solves the interactive workflow: choose an area, fetch streets, inspect elevation, edit graph nodes, trigger processing, and reload saved projects.
- Main stack: Next.js App Router, React 19, TypeScript, MapLibre, `react-map-gl`, TanStack Query, Zustand, Tailwind CSS, Radix/Base UI primitives, and workspace packages.
- Current status: active and expected to stay aligned with `apps/api`, `@urbanus/geo`, `@urbanus/constants`, and `@urbanus/utils`.
- Technical value: keeps browser map behavior, editor state, API proxies, and translation blockers explicit in the frontend layer.

Next.js frontend for URBANUS. It provides the project workspace, map editor, network visualization, project list, sidebar controls, processing actions, and UI flows that talk to the URBANUS API through same-origin routes.

## Overview

`apps/web` is the interactive surface of the monorepo. It should stay aligned with the backend graph-processing contract and the shared workspace packages under `packages/`.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- MapLibre-based map rendering
- pnpm workspace scripts from the repository root

## Getting Started

Install dependencies from the repository root, then use the web-specific script:

```bash
pnpm install
pnpm dev:web
```

From this app directory, the local app script is also available:

```bash
pnpm dev
```

## Project Structure

```text
apps/web/
├── app/              # App Router routes and layouts
├── components/       # Shared UI and product components
├── features/         # Feature-specific editor and map modules
├── i18n/             # Locale dictionaries and typed copy contracts
└── lib/              # Client-side helpers and API adapters
```

## Architecture

### Main Components

- `app/`: App Router pages for home, map, projects, and same-origin API routes.
- `components/`: product UI, map panels, pipeline controls, and shared UI primitives.
- `features/map/`: map-specific services, validators, hooks, types, serialization tests, and helpers.
- `stores/`: client-side state containers for editor and workflow state.
- `lib/`: graph, sewer, and map helpers used by routes and components.

### Data Flow

The app fetches streets through `/api/streets`, forwards project calls through `/api/projects`, keeps edit state in the browser, and sends the edited sewer graph to the Python API for processing and persistence.

### Key Design Choices

- Browser-facing backend calls should go through same-origin routes where possible.
- Shared geospatial behavior should be imported from `@urbanus/geo` rather than duplicated in components.
- UI copy and translation blockers belong in the root app contracts so browser translation does not mutate the DOM.

## Known Limitations

- Keep browser-facing API calls routed through the app's same-origin API layer when possible.
- Keep translation blockers in the root layout so browser translation tools do not mutate the React DOM.
- Update the root README when frontend behavior changes the supported product workflow.
