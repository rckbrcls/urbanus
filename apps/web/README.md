# URBANUS Web

> **Status:** Active
> This app is currently maintained as the browser-based editor and dashboard for the URBANUS workspace.

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

## Notes

- Keep browser-facing API calls routed through the app's same-origin API layer when possible.
- Keep translation blockers in the root layout so browser translation tools do not mutate the React DOM.
- Update the root README when frontend behavior changes the supported product workflow.
