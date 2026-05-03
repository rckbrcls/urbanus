# Documentation

Welcome to the documentation for URBANUS.

## Guides

- [Getting Started](getting-started.md)
- [Architecture](architecture.md)
- [API](api.md)
- [Deployment](deployment.md)
- [Troubleshooting](troubleshooting.md)

## Main Surfaces

- `apps/web/`: Next.js map editor and project workspace.
- `apps/api/`: FastAPI processing API.
- `packages/`: shared TypeScript constants, geo helpers, and utilities.
- `py/urbanus-geo/`: shared Python geometry/elevation helper package.

## Notes

- The root README remains the deep technical reference.
- Keep frontend same-origin API routes aligned with the FastAPI contract.
- Update `.env.example` whenever database, proxy, or provider variables change.
