# @urbanus/constants

> **Status:** Active
> Shared TypeScript constants for the URBANUS workspace.

## Summary

- Private workspace package for TypeScript constants shared by URBANUS apps and packages.
- Solves drift between frontend code paths by centralizing area limits, node semantics, rate limits, defaults, hydraulics, and pipeline constants.
- Main stack: TypeScript and Vitest.
- Current status: active and exported as `@urbanus/constants`.
- Technical value: keeps domain constants testable and importable without tying them to UI components.

Private workspace package that centralizes domain constants used by URBANUS frontend and shared TypeScript code.

## Features

- Area defaults and limits.
- Node semantics.
- Rate-limit constants.
- Hydraulic and pipeline constants.

## Tech Stack

- TypeScript
- Vitest

## Usage

The package exports from `src/index.ts`:

```ts
export * from "./area";
export * from "./nodes";
export * from "./rate-limits";
export * from "./defaults";
export * from "./hydraulics";
export * from "./pipeline";
```

## Project Structure

```text
packages/constants/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
```

## Technical Highlights

- Private package exported as `@urbanus/constants`.
- `package.json` exposes `type-check` and `test` scripts.
- Tests live beside the constants they validate.
