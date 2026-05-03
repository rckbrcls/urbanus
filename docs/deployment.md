# Deployment

## Overview

URBANUS includes Dockerfiles and `docker-compose.yml` for local multi-service orchestration. A confirmed production deployment workflow was not detected during this documentation pass.

## Components

- `apps/api/Dockerfile`: Python API container.
- `apps/web/Dockerfile`: Next.js web container.
- `docker-compose.yml`: local orchestration for project services.

## Environment Variables

See `.env.example` for database, API URL, and terrain API placeholders.

## Notes

- Confirm production host, database provisioning, migrations, and secret management before documenting production deployment.
- Do not commit real API keys or database credentials.
