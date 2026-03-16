# CLAUDE.md — URBANUS

Monorepo poliglota: pnpm workspace (JS/TS) + uv workspace (Python) + Makefile.

**Estrutura**
- `apps/web/`: Next.js (App Router) — `@urbanus/web`
- `apps/api/`: FastAPI (Python package `urbanus_api`) — CRUD de projetos + elevação + nós
- `packages/geo/`: `@urbanus/geo` — tipos geo canônicos (`LatLng`, `BoundingBox`) + cálculos + validações
- `packages/constants/`: `@urbanus/constants` — constantes compartilhadas (limites, rate limits, defaults)
- `packages/utils/`: `@urbanus/utils` — utilitários puros (`RateLimiter`, `withRetry`, `throttle`)
- `py/urbanus-geo/`: `urbanus-geo` — tipos Pydantic + cálculos geo + constantes (fonte de verdade Python)
- `schemas/`: placeholder para contratos JSON Schema / OpenAPI

**Princípio:** compartilhar contrato, não implementação. Cada ecossistema tem sua própria implementação dos tipos geo.

**Fluxos principais**
- Seleção de área no mapa (Shift + Drag) → validação de área (máx. 100 km²).
- `POST /api/streets` (Next.js) consulta Overpass → GeoJSON de ruas.
- `POST /api/elevation/enrich` (Next.js) faz proxy para o FastAPI → GeoJSON com elevação.
- Projetos são salvos no Mongo via FastAPI (`/projects`).

**Comandos**
Orquestração (Makefile):
```bash
make install    # pnpm install + uv sync
make dev        # dev-web + dev-api em paralelo
make build      # turbo build (JS/TS)
make lint       # turbo lint + ruff (Python)
make type-check # turbo type-check
```

Frontend (Next.js):
```bash
cd apps/web
pnpm dev
pnpm lint
pnpm build
```

Backend (FastAPI):
```bash
cd apps/api
uv run uvicorn urbanus_api.main:app --reload --host 0.0.0.0 --port 8000
```

Turbo (JS/TS):
```bash
pnpm turbo run dev --filter @urbanus/web
pnpm turbo run build
pnpm turbo run type-check
```

Docker (stack completa):
```bash
docker-compose up --build
```

**Variáveis de ambiente**
- `OPENTOPOGRAPHY_API_KEY`: obrigatório para elevação (FastAPI e rota `/api/topography`).
- `PYTHON_API_URL`: usado pelo Next.js em `apps/web/app/api/elevation/enrich/route.ts` (default `http://localhost:8000`).
- `MONGO_URL`: usado pelo FastAPI (default `mongodb://localhost:27018/urbanus`).

**Pontos de atenção**
- Limite de área: 100 km² definido em `@urbanus/constants` (JS) e `urbanus-geo` (Python).
- O frontend ainda usa `http://localhost:8000` hardcoded em `apps/web/stores/useProjectStore.ts`.
- Leaflet roda apenas no client; o mapa é carregado via `dynamic()` em `apps/web/app/page.tsx`.
- `apps/web/lib/geo/` é um shim que re-exporta de `@urbanus/geo`.

**Onde mexer primeiro**
- Lógica de mapa e nós: `apps/web/features/map/` (context, services, hooks, validators).
- UI do mapa: `apps/web/components/Map.tsx` usa o módulo `features/map`.
- Elevação no servidor: `apps/api/src/urbanus_api/elevation.py` e endpoint `POST /elevation/enrich`.
- CRUD de projetos: `apps/api/src/urbanus_api/main.py` + `apps/web/stores/useProjectStore.ts`.
- Tipos geo (JS): `packages/geo/src/` — fonte de verdade para LatLng, BoundingBox no JS.
- Tipos geo (Python): `py/urbanus-geo/src/urbanus_geo/` — fonte de verdade Pydantic.

**Testes**
- Não há suite automatizada. Use `pnpm lint` no frontend.
