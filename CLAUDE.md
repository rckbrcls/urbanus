# CLAUDE.md — URBANUS

Este repositório contém duas linhas principais:
- App web moderna (Next.js + React + Leaflet) em `client/`.
- Backend Python (FastAPI + MongoDB + rasterio) em `server/`.

**Estrutura**
- `client/`: Next.js (App Router) com módulo de mapa em `client/features/map/`.
- `server/`: FastAPI com CRUD de projetos e enriquecimento de elevação via OpenTopography.
- `docs/`: documentos de arquitetura e decisões.

**Fluxos principais (web atual)**
- Seleção de área no mapa (Shift + Drag) → validação de área (máx. 100 km²).
- `POST /api/streets` (Next.js) consulta Overpass → GeoJSON de ruas.
- `POST /api/elevation/enrich` (Next.js) faz proxy para o FastAPI → GeoJSON com elevação.
- Projetos são salvos no Mongo via FastAPI (`/projects`).

**Comandos**
Frontend (Next.js):
```bash
cd client
pnpm dev
pnpm lint
pnpm build
```

Backend (FastAPI):
```bash
cd server
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Docker (stack completa):
```bash
docker-compose up --build
```

**Variáveis de ambiente**
- `OPENTOPOGRAPHY_API_KEY`: obrigatório para elevação (FastAPI e rota `/api/topography`).
- `PYTHON_API_URL`: usado pelo Next.js em `client/app/api/elevation/enrich/route.ts` (default `http://localhost:8000`).
- `MONGO_URL`: usado pelo FastAPI (default `mongodb://localhost:27018/urbanus`).

**Pontos de atenção**
- Limite de área: 100 km² em `client/app/api/streets/route.ts`, `client/app/api/topography/route.ts` e `server/elevation.py`.
- O frontend ainda usa `http://localhost:8000` hardcoded em `client/stores/useProjectStore.ts`.
- Leaflet roda apenas no client; o mapa é carregado via `dynamic()` em `client/app/page.tsx`.

**Onde mexer primeiro**
- Lógica de mapa e nós: `client/features/map/` (context, services, hooks, validators).
- UI do mapa: `client/components/Map.tsx` usa o módulo `features/map`.
- Elevação no servidor: `server/elevation.py` e endpoint `POST /elevation/enrich`.
- CRUD de projetos: `server/main.py` + `client/stores/useProjectStore.ts`.

**Testes**
- Não há suite automatizada. Use `pnpm lint` no frontend.
