# 03 -- Backend FastAPI

## Estrutura relevante

```text
apps/api/src/urbanus_api/
├── main.py                    # Endpoints FastAPI e orquestracao do pipeline
├── models.py                  # Contratos Pydantic de request/response
├── data/
│   ├── database.py            # Engine async e dependency get_db
│   ├── tables.py              # ORM SQLAlchemy + PostGIS
│   └── repositories.py        # CRUD de projetos + persistencia de SewerNetwork
├── services/
│   └── elevation.py           # Download/amostragem de DEM via OpenTopography
└── core/
    ├── graph/                 # classificacao, sanitizacao, cobertura, acessorios
    ├── elevation/             # deteccao de extremos
    ├── routing/               # RSPH e pesos de roteamento
    └── optimizer/             # reducao de nos
```

## Superficie HTTP suportada

O backend exposto pelo runtime atual ficou reduzido a sete endpoints:

```text
POST   /projects
GET    /projects
GET    /projects/{project_id}
DELETE /projects/{project_id}
POST   /nodes/extract
POST   /elevation/enrich
POST   /projects/{project_id}/process
```

Nao existe mais `GET /` de health no contrato do app.

## Contratos principais

### `Project`

```python
class Project(BaseModel):
    id: str
    name: str
    createdAt: int
    bounds: BoundingBox
    areaKm2: float
    center: List[float]
    zoom: float
    stats: ProjectStats
    streets: Dict[str, Any]
    sewerNetwork: SewerNetwork | None = None
```

`sewerNetwork` continua opcional no CRUD, mas quando presente ele e salvo em `streets_geojson._sewerNetwork` para reidratacao do editor e sincronizado nas tabelas processadas do PostGIS.

### `NodesExtractRequest`

```python
class NodesExtractRequest(BaseModel):
    geojson: Dict[str, Any]
    mode: Literal["intersections", "all"] = "intersections"
```

### `ElevationEnrichRequest`

```python
class ElevationEnrichRequest(BaseModel):
    geojson: Dict[str, Any]
    bbox: ElevationEnrichBbox
    demType: str | None = "COP30"
```

### `ProcessRequest`

```python
class ProcessRequest(BaseModel):
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
```

O processamento agora aceita **apenas** o grafo editado vindo do frontend. Nao existe mais branch de reconstrucao a partir de `streets_geojson`.

## Fluxo do endpoint `POST /projects/{project_id}/process`

1. Carrega o projeto pelo ID.
2. Exige body JSON com `nodes` e `edges`.
3. Reconstrui `G: nx.Graph` apenas a partir do payload editado.
4. Executa classificacao complementar, sanitizacao, extremos, roteamento, cobertura, reducao de nos e acessorios.
5. Serializa `SewerNetwork`.
6. Persiste o resultado no PostGIS e atualiza `streets_geojson._sewerNetwork`.
7. Retorna o payload serializado.

Erros de contrato retornam `400` com mensagens explicitas como:

- `Edited graph payload with nodes and edges is required.`
- `Edited graph payload must include non-empty nodes and edges.`
- `Edited graph payload contains edges that reference missing nodes.`

## Persistencia

`repositories.py` concentra dois blocos:

- `ProjectRepository`: upsert/list/get/delete do projeto e merge de metadados em `streets_geojson`
- `save_sewer_network_to_postgis(...)`: limpa e repopula `nodes` e `edges` para o projeto

Isso deixa a camada `core/` focada no algoritmo, sem helper de persistencia misturado ao pipeline.

## Relacao com o frontend

- A home usa `POST /elevation/enrich` seguido de `POST /nodes/extract`.
- O editor usa CRUD de `projects` para abrir/salvar.
- O processamento do editor sempre passa pelo proxy Next `POST /api/projects/{id}/process`, que encaminha o grafo editado ao FastAPI.
