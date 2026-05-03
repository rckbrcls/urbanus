# @urbanus/utils

> **Status:** Active
> Shared utility helpers for the URBANUS TypeScript workspace.

## Summary

- Private workspace package for reusable TypeScript utilities in URBANUS.
- Solves cross-app repetition for rate limiting, retry behavior, retryable fetches, and throttling.
- Main stack: TypeScript and Vitest.
- Current status: active and exported as `@urbanus/utils`.
- Technical value: keeps non-domain helpers reusable without pulling in map, API, or React dependencies.

Private workspace package for generic runtime helpers that are not tied to UI rendering or geospatial domain modeling.

## Features

- Rate limiter.
- Retry helpers.
- Retryable fetch wrapper.
- Throttle helper.

## Tech Stack

- TypeScript
- Vitest

## Usage

The package exports from `src/index.ts`:

```ts
export { RateLimiter } from "./rate-limiter";
export { withRetry, isRetryableError, fetchWithRetry } from "./retry";
export type { RetryOptions } from "./retry";
export { throttle } from "./throttle";
```

## Project Structure

```text
packages/utils/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
```

## Technical Highlights

- Helpers are covered by colocated Vitest tests.
- The package is intentionally domain-light so app code can reuse it without pulling in map or API concerns.
