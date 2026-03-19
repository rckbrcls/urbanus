# CLAUDE.md — URBANUS

Monorepo poliglota: pnpm workspace (JS/TS) + uv workspace (Python) + Makefile.

**Estrutura**
- `apps/web/`: Next.js (App Router) — `@urbanus/web`
- `apps/api/`: FastAPI (Python package `urbanus_api`) — CRUD de projetos + elevação + nós + pipeline de esgoto
- `packages/geo/`: `@urbanus/geo` — tipos geo canônicos (`LatLng`, `BoundingBox`, `SewerNode`, etc.) + cálculos + validações
- `packages/constants/`: `@urbanus/constants` — constantes compartilhadas (limites, rate limits, defaults, hidráulica NBR 9649, pipeline)
- `packages/utils/`: `@urbanus/utils` — utilitários puros (`RateLimiter`, `withRetry`, `throttle`)
- `py/urbanus-geo/`: `urbanus-geo` — tipos Pydantic + cálculos geo + constantes NBR 9649 (fonte de verdade Python)
- `schemas/`: placeholder para contratos JSON Schema / OpenAPI

**Princípio:** compartilhar contrato, não implementação. Cada ecossistema tem sua própria implementação dos tipos geo.

**Arquitetura do Backend (FastAPI)**
```
apps/api/src/urbanus_api/
├── main.py                          # Rotas FastAPI
├── models.py                        # Pydantic request/response
├── data/
│   ├── database.py                  # Engine async, session, get_db
│   ├── tables.py                    # SQLAlchemy ORM + PostGIS
│   └── repositories.py             # CRUD (projects)
├── services/
│   ├── elevation.py                 # OpenTopography (GeoTIFF → elevação)
│   └── overpass.py                  # Stub para queries Overpass
├── core/
│   ├── graph/
│   │   ├── builder.py              # PostGIS ↔ NetworkX
│   │   ├── classification.py       # Etapa 1: nós obrigatórios (ROSA)
│   │   └── sanitization.py         # Etapas 2-4: subdivisão, remoção, curvas
│   ├── elevation/
│   │   ├── sampling.py             # Amostragem bilinear de DEM
│   │   └── extrema.py              # Etapa 5: máximos/mínimos + proeminência
│   ├── routing/
│   │   ├── rsph.py                 # Etapa 6: Repeated Shortest Path Heuristic
│   │   ├── cost.py                 # Função de custo (pipe + escavação + penalidades)
│   │   └── arborescence.py         # Alternativa: Edmonds/Chu-Liu
│   ├── hydraulics/
│   │   ├── manning.py              # Fórmula de Manning + raio hidráulico
│   │   └── dimensioning.py         # Etapa 8: dimensionamento de tubos
│   └── optimizer/
│       └── low_points.py           # Etapa 7: resolução de pontos baixos
└── workers/
    └── __init__.py                  # Stub para ARQ tasks futuras
```

**Pipeline de 8 Etapas (POST /projects/{id}/process)**
1. Classificação de nós obrigatórios (ROSA) — `core/graph/classification.py`
2. Subdivisão de arestas longas (VERDE) — `core/graph/sanitization.py`
3. Remoção de nós redundantes (VERMELHO) — `core/graph/sanitization.py`
4. Resolução de clusters de curva — `core/graph/sanitization.py`
5. Detecção de máximos/mínimos (AMARELO/AZUL_ESCURO) — `core/elevation/extrema.py`
6. Roteamento gravitacional RSPH — `core/routing/rsph.py`
7. Resolução de pontos baixos (elevatórias) — `core/optimizer/low_points.py`
8. Dimensionamento hidráulico NBR 9649 — `core/hydraulics/dimensioning.py`

**Fluxos principais**
- Seleção de área no mapa (Shift + Drag) → validação de área (máx. 100 km²).
- `POST /api/streets` (Next.js) consulta Overpass → GeoJSON de ruas.
- `POST /api/elevation/enrich` (Next.js) faz proxy para o FastAPI → GeoJSON com elevação.
- Projetos são salvos no PostgreSQL/PostGIS via FastAPI (`/projects`).
- `POST /projects/{id}/process` executa pipeline completo → retorna SewerNetwork.

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

Alembic (migrações):
```bash
cd apps/api
uv run alembic upgrade head
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
- `DATABASE_URL`: usado pelo FastAPI (default `postgresql+asyncpg://urbanus:urbanus@localhost:5432/urbanus`).

**Pontos de atenção**
- Limite de área: 100 km² definido em `@urbanus/constants` (JS) e `urbanus-geo` (Python).
- O frontend ainda usa `http://localhost:8000` hardcoded em `apps/web/stores/useProjectStore.ts`.
- Leaflet roda apenas no client; o mapa é carregado via `dynamic()` em `apps/web/app/page.tsx`.
- `apps/web/lib/geo/` é um shim que re-exporta de `@urbanus/geo`.
- Constantes NBR 9649 em Python (`py/urbanus-geo/.../constants.py`) e JS (`packages/constants/src/hydraulics.ts`, `pipeline.ts`).
- NodeType cores: ROSA=PV obrigatório, VERDE=intermediário, VERMELHO=redundante, AMARELO=ponto alto, AZUL_ESCURO=ponto baixo.

**Onde mexer primeiro**
- Pipeline de esgoto: `apps/api/src/urbanus_api/core/` — algoritmos das 8 etapas.
- Lógica de mapa e nós: `apps/web/features/map/` (context, services, hooks, validators).
- UI do mapa: `apps/web/components/Map.tsx` usa o módulo `features/map`.
- Elevação no servidor: `apps/api/src/urbanus_api/services/elevation.py` e endpoint `POST /elevation/enrich`.
- CRUD de projetos: `apps/api/src/urbanus_api/main.py` + `apps/web/stores/useProjectStore.ts`.
- Tipos geo (JS): `packages/geo/src/` — fonte de verdade para LatLng, BoundingBox, SewerNode no JS.
- Tipos geo (Python): `py/urbanus-geo/src/urbanus_geo/` — fonte de verdade Pydantic.
- Camada de dados: `apps/api/src/urbanus_api/data/` — SQLAlchemy + PostGIS.
- Constantes NBR 9649 (Python): `py/urbanus-geo/src/urbanus_geo/constants.py`.
- Constantes NBR 9649 (JS): `packages/constants/src/hydraulics.ts` e `pipeline.ts`.

**Testes**
- Não há suite automatizada. Use `pnpm lint` no frontend.

**Documentação Técnica (`docs/`)**

> **Regra de manutenção:** ao alterar código no domínio de um documento, atualizar o documento correspondente em `docs/`. Se a alteração criar um novo módulo ou conceito não coberto, adicionar uma entrada nesta tabela.

| Doc | Descrição | Domínio (arquivos/pastas) |
|-----|-----------|---------------------------|
| `00-visao-geral.md` | Visão geral do projeto | Atualizar quando mudar stack, fluxo principal ou arquitetura |
| `01-arquitetura-monorepo.md` | Estrutura do monorepo e infra | `pnpm-workspace.yaml`, `turbo.json`, `Makefile`, `docker-compose.yml`, `Dockerfile`s, variáveis de ambiente |
| `02-tipos-e-constantes.md` | Tipos geo e constantes NBR 9649 | `packages/geo/src/`, `packages/constants/src/`, `packages/utils/src/`, `py/urbanus-geo/src/urbanus_geo/` |
| `03-backend-api.md` | API FastAPI e endpoints | `apps/api/src/urbanus_api/main.py`, `models.py`, `data/`, `services/`, `core/graph/builder.py` |
| `04-banco-de-dados.md` | Esquema PostGIS e migrações | `apps/api/src/urbanus_api/data/tables.py`, `migrations/` |
| `05-pipeline-8-etapas.md` | Pipeline completo de esgoto | `apps/api/src/urbanus_api/core/` (todos os módulos do pipeline) |
| `06-hidraulica-nbr9649.md` | Hidráulica e Manning | `core/hydraulics/`, `core/routing/cost.py`, `urbanus_geo/calculations.py` (funções hidráulicas) |
| `07-algoritmos-geo.md` | Algoritmos geoespaciais | `core/elevation/sampling.py`, `urbanus_geo/calculations.py` (funções geo), `packages/geo/src/calculations.ts` |
| `08-frontend.md` | Frontend Next.js | `apps/web/app/`, `apps/web/components/`, `apps/web/features/map/` |
| `09-estado-e-stores.md` | Stores e estado global | `apps/web/stores/`, `apps/web/hooks/useDerivedGeoJSON.ts` |
| `10-editor-de-grafos.md` | Editor de grafos no mapa | `apps/web/hooks/useGraphEditor.ts`, `apps/web/types/map.ts`, `apps/web/lib/map/snapping.ts`, `apps/web/stores/commandManager.ts` |
| `11-elevacao-e-topografia.md` | Elevação e DEM | `apps/api/src/urbanus_api/services/elevation.py`, `core/elevation/` |
| `12-referencias.md` | Referências técnicas | Atualizar quando adicionar dependência ou referência acadêmica |
