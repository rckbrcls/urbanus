# 01 -- Arquitetura do Monorepo

## Estrutura de Pastas

```
URBANUS/
├── apps/
│   ├── web/                    # @urbanus/web — Next.js 15 (App Router)
│   │   ├── app/                # Paginas, layouts, API routes
│   │   ├── components/         # Componentes React (Map, paineis, UI)
│   │   ├── features/map/       # Modulo de mapa (hooks, services, validators)
│   │   ├── hooks/              # Hooks do editor de grafos
│   │   ├── lib/                # Utilitarios, snapping, conversoes
│   │   ├── stores/             # Zustand stores (graphStore, areaSelection, etc.)
│   │   ├── types/              # Tipos TypeScript do frontend
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── api/                    # FastAPI (Python) — urbanus_api
│       ├── src/urbanus_api/    # Codigo-fonte
│       │   ├── main.py         # Rotas FastAPI
│       │   ├── models.py       # Pydantic request/response
│       │   ├── data/           # Database, tables, repositories
│       │   ├── services/       # Integracoes server-side (elevacao)
│       │   └── core/           # Pipeline de 8 etapas
│       ├── migrations/         # Alembic (PostGIS)
│       ├── Dockerfile
│       └── pyproject.toml
│
├── packages/
│   ├── geo/                    # @urbanus/geo — tipos geo + calculos + validacoes
│   │   └── src/
│   │       ├── types.ts        # LatLng, BoundingBox, SewerNode, SewerEdge, etc.
│   │       ├── calculations.ts # Haversine, area, slope, angulo
│   │       ├── validations.ts  # Validadores de coordenadas e GeoJSON
│   │       └── index.ts
│   │
│   ├── constants/              # @urbanus/constants — constantes compartilhadas
│   │   └── src/
│   │       ├── area.ts         # Limites de area (100 km²)
│   │       ├── nodes.ts        # Restricoes de nos
│   │       ├── rate-limits.ts  # Rate limits por servico
│   │       ├── defaults.ts     # Centro padrao, zoom, cache
│   │       ├── hydraulics.ts   # Constantes NBR 9649
│   │       ├── pipeline.ts     # Constantes do pipeline (distancias, angulos, custos)
│   │       └── index.ts
│   │
│   └── utils/                  # @urbanus/utils — utilitarios puros
│       └── src/
│           ├── rate-limiter.ts # RateLimiter (sliding window)
│           ├── retry.ts        # withRetry, fetchWithRetry (exponential backoff)
│           ├── throttle.ts     # throttle (leading + trailing)
│           └── index.ts
│
├── py/
│   └── urbanus-geo/            # urbanus-geo — tipos Pydantic + calculos (Python)
│       └── src/urbanus_geo/
│           ├── types.py        # LatLng, SewerNode, etc. (Pydantic)
│           ├── constants.py    # Constantes NBR 9649 (fonte de verdade Python)
│           ├── calculations.py # Haversine, Manning, slope, pump_npv
│           └── __init__.py
│
├── schemas/                    # Placeholder para contratos JSON Schema / OpenAPI
├── docker-compose.yml          # Stack completa (client, server, postgres)
├── Makefile                    # Orquestracao de comandos
├── turbo.json                  # Pipeline Turborepo
├── pnpm-workspace.yaml         # Workspaces pnpm
├── package.json                # Raiz do monorepo
└── CLAUDE.md                   # Instrucoes para assistente de codigo
```

## Principio Arquitetural

**Compartilhar contrato, nao implementacao.** Cada ecossistema (JS/TS e Python) tem sua propria implementacao dos tipos geoespaciais e formulas. O que e compartilhado e o _contrato_ -- os nomes de tipos, campos e semantica devem ser identicos entre `@urbanus/geo` (TypeScript) e `urbanus-geo` (Python).

Isso evita dependencias cruzadas entre runtimes e permite que cada lado evolua com as ferramentas idiomáticas do seu ecossistema.

## Workspaces

### pnpm (JavaScript/TypeScript)

Configurado em `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/web"
  - "packages/*"
```

Pacotes do workspace:
- `@urbanus/web` (`apps/web/`) — aplicacao Next.js
- `@urbanus/geo` (`packages/geo/`) — tipos e calculos geoespaciais
- `@urbanus/constants` (`packages/constants/`) — constantes compartilhadas
- `@urbanus/utils` (`packages/utils/`) — utilitarios puros

O backend Python (`apps/api/`) **nao** faz parte do workspace pnpm.

### uv (Python)

O backend usa `uv` como gerenciador de pacotes Python. O `pyproject.toml` do monorepo raiz referencia:
- `apps/api/` — aplicacao FastAPI (`urbanus_api`)
- `py/urbanus-geo/` — modulo Python de tipos e calculos (`urbanus-geo`)

Ambos compartilham o mesmo lockfile (`uv.lock`) e ambiente virtual.

## Turbo Pipeline

Configurado em `turbo.json`:

```json
{
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "type-check": {
      "dependsOn": ["^type-check"]
    }
  }
}
```

- `dev`: execucao persistente (long-running), sem cache
- `build`: depende do build dos pacotes internos; output do Next.js e cacheado
- `lint` e `type-check`: dependem das tarefas homonimas dos pacotes internos

## Makefile

Orquestracao unificada para ambos os ecossistemas:

```makefile
install:       # pnpm install + uv sync
dev:           # dev-web + dev-api em paralelo (& wait)
dev-web:       # pnpm turbo run dev --filter @urbanus/web
dev-api:       # cd apps/api && uv run uvicorn urbanus_api.main:app --reload --port 8000
build:         # pnpm turbo run build
lint:          # pnpm turbo run lint + cd apps/api && uv run ruff check .
type-check:    # pnpm turbo run type-check
```

`make dev` inicia simultaneamente:
- Frontend em `http://localhost:3000` (Next.js dev server)
- Backend em `http://localhost:8000` (uvicorn com hot-reload)

O script raiz usa `concurrently --kill-others-on-fail` e o comando do backend roda com `exec uv run ... uvicorn --reload`. Isso reduz o risco de o processo supervisor do reload ficar preso na porta `8000` quando a sessao de desenvolvimento e interrompida.

## Docker Compose

Tres servicos definidos em `docker-compose.yml`:

### client (Next.js)

- Imagem: Node 20 Alpine + pnpm
- Porta: 3000
- Monta volumes para codigo-fonte e pacotes compartilhados
- Variavel `PYTHON_API_URL=http://server:8000` aponta para o backend

### server (FastAPI)

- Imagem: Python 3.11 slim + GDAL + rasterio + uv
- Porta: 8000
- Monta `apps/api/` e `py/` (modulo urbanus-geo)
- Variaveis:
  - `DATABASE_URL=postgresql+asyncpg://urbanus:urbanus@postgres:5432/urbanus`
  - `OPENTOPOGRAPHY_API_KEY` (do ambiente host)
- Depende do `postgres` (healthcheck `pg_isready`)
- Entrypoint executa migracoes Alembic antes de iniciar o uvicorn

### postgres (PostGIS)

- Imagem: `postgis/postgis:16-3.4`
- Porta: 5432
- Credenciais: `urbanus:urbanus`, database `urbanus`
- Volume nomeado `pgdata` para persistencia
- Healthcheck: `pg_isready -U urbanus` (intervalo 5s, 5 retries)

## Variaveis de Ambiente

| Variavel | Usado por | Descricao |
|----------|-----------|-----------|
| `OPENTOPOGRAPHY_API_KEY` | FastAPI e proxy Next `/api/elevation/enrich` | Chave da API OpenTopography usada no enriquecimento de elevacao |
| `PYTHON_API_URL` | Next.js | URL do backend FastAPI (default: `http://localhost:8000`) |
| `DATABASE_URL` | FastAPI | String de conexao PostgreSQL com asyncpg |

A `DATABASE_URL` padrao e `postgresql+asyncpg://urbanus:urbanus@localhost:5432/urbanus` para desenvolvimento local (ou `postgres:5432` dentro do Docker).
