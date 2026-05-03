# @urbanus/geo

> **Status:** Active
> Shared TypeScript geospatial helpers for URBANUS.

## Summary

- Private workspace package for TypeScript geospatial calculations, clipping, validation, and GeoJSON-facing types.
- Solves duplicated geometry logic in the web app by keeping map-related math outside React components.
- Main stack: TypeScript, GeoJSON types, and Vitest.
- Current status: active and exported as `@urbanus/geo`.
- Technical value: provides parity-tested geospatial behavior that can stay aligned with the Python `urbanus-geo` package.

Private workspace package for geometry calculations, clipping, GeoJSON-related types, and validation helpers used by the web app and TypeScript-side tests.

## Features

- Geospatial calculations.
- Clipping helpers.
- Shared GeoJSON-facing types.
- Validation utilities and parity tests.

## Tech Stack

- TypeScript
- GeoJSON types
- Vitest

## Usage

The package exports from `src/index.ts`:

```ts
export * from "./types";
export * from "./calculations";
export * from "./clipping";
export * from "./validations";
```

## Project Structure

```text
packages/geo/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
```

## Architecture

This package keeps frontend geospatial behavior separate from UI components. It also has parity tests that help keep TypeScript calculations aligned with the Python geospatial package.
