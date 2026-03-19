# 03 -- Backend FastAPI

## Estrutura de Pastas

```
apps/api/src/urbanus_api/
├── main.py                          # App FastAPI + endpoints
├── models.py                        # Modelos Pydantic (request/response)
├── data/
│   ├── database.py                  # Engine async, session factory, get_db
│   ├── tables.py                    # SQLAlchemy ORM + PostGIS
│   └── repositories.py             # CRUD (ProjectRepository)
├── services/
│   ├── elevation.py                 # OpenTopography (GeoTIFF -> elevacao)
│   └── overpass.py                  # Stub para queries Overpass
├── core/
│   ├── graph/
│   │   ├── builder.py              # PostGIS <-> NetworkX
│   │   ├── classification.py       # Etapa 1: classificacao de nos
│   │   └── sanitization.py         # Etapas 2-4: subdivisao, remocao, curvas
│   ├── elevation/
│   │   ├── sampling.py             # Amostragem bilinear de DEM
│   │   └── extrema.py              # Etapa 5: maximos/minimos topograficos
│   ├── routing/
│   │   ├── rsph.py                 # Etapa 6: Repeated Shortest Path Heuristic
│   │   ├── cost.py                 # Funcao de custo de arestas
│   │   └── arborescence.py         # Alternativa: Edmonds/Chu-Liu
│   ├── hydraulics/
│   │   ├── manning.py              # Formula de Manning (re-exporta de urbanus-geo)
│   │   └── dimensioning.py         # Etapa 8: dimensionamento de tubos
│   └── optimizer/
│       └── low_points.py           # Etapa 7: resolucao de pontos baixos
└── workers/
    └── __init__.py                  # Stub para tasks assincronas (ARQ futuro)
```

## Endpoints da API

### Health Check

```
GET /
Response: {"status": "ok"}
```

### Projetos (CRUD)

```
POST   /projects              Cria ou atualiza projeto
GET    /projects              Lista todos os projetos
GET    /projects/{project_id} Retorna projeto por ID
DELETE /projects/{project_id} Deleta projeto e dados relacionados (cascade)
```

O `POST /projects` recebe um objeto `Project` e faz upsert: se o ID ja existe, atualiza; caso contrario, insere. As coordenadas de `bounds` e `center` sao convertidas para geometrias PostGIS (`POLYGON` e `POINT`, SRID 4326).

### Extracao de Nos

```
POST /nodes/extract
Body: NodesExtractRequest
Response: { nodes: [...], metadata: {...} }
```

Recebe GeoJSON de ruas enriquecido com elevacao e extrai nos da rede. O parametro `mode` controla a filtragem:
- `"intersections"`: apenas nos com grau >= 2 (intersecoes) e extremidades
- `"all"`: todos os vertices (para edicao detalhada)

A classificacao ROSA e atribuida a nos obrigatorios (intersecoes, extremidades, quedas bruscas de elevacao > 0.50 m). Os extremos globais de elevacao recebem AMARELO (mais alto) e AZUL_ESCURO (mais baixo).

### Enriquecimento de Elevacao

```
POST /elevation/enrich
Body: ElevationEnrichRequest
Response: GeoJSON FeatureCollection enriquecido
```

Pipeline:
1. Busca GeoTIFF do OpenTopography para a bbox especificada
2. Abre o raster em memoria com `rasterio.MemoryFile`
3. Para cada LineString, amostra a elevacao em cada vertice
4. Adiciona `vertex_elevations` (lista de floats) e `elevation` (estatisticas: min, max, avg, range) nas propriedades de cada feature
5. Retorna o GeoJSON enriquecido

### Pipeline Completo

```
POST /projects/{project_id}/process
Response: SewerNetwork (nodes, edges, pipes, pump_stations, unreachable)
```

Executa o pipeline de 8 etapas (detalhado em `docs/05-pipeline-8-etapas.md`):

1. Carrega grafo do PostGIS (`build_graph_from_postgis`)
2. Sanitiza arestas longas (`sanitize_long_edges`)
3. Remove nos redundantes (`remove_redundant_nodes`)
4. Resolve clusters de curva (`resolve_curve_clusters`)
5. Detecta extremos de elevacao (`detect_extrema`)
6. Identifica nos obrigatorios e exutorio (min elevacao)
7. Roteamento RSPH (`rsph_sewer_routing`)
8. Resolve pontos baixos (`resolve_low_points`)
9. Dimensionamento hidraulico (`dimension_network`)
10. Salva resultados no PostGIS (`save_graph_to_postgis`)
11. Monta e retorna `SewerNetwork`

## Modelos Pydantic (`models.py`)

### Request Models

```python
class NodesExtractRequest(BaseModel):
    geojson: Dict                          # FeatureCollection com LineStrings
    mode: Literal["intersections", "all"]  # default: "intersections"

class ElevationEnrichBbox(BaseModel):
    south: float
    north: float
    west: float
    east: float

class ElevationEnrichRequest(BaseModel):
    geojson: Dict                          # FeatureCollection
    bbox: ElevationEnrichBbox
    demType: Optional[str] = "COP30"       # SRTMGL3, SRTMGL1, COP30, COP90, etc.
```

### Response Models

```python
class ProjectStats(BaseModel):
    streetCount: int

class Project(BaseModel):
    id: str                    # UUID
    name: str
    createdAt: int             # Unix timestamp
    bounds: BoundingBox        # {southWest: {lat, lng}, northEast: {lat, lng}}
    areaKm2: float
    center: List[float]        # [lat, lng]
    zoom: float
    stats: ProjectStats
    streets: Dict[str, Any]    # GeoJSON com metadados
```

## Camada de Dados

### Engine e Session (`database.py`)

```python
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://urbanus:urbanus@localhost:5432/urbanus"
)

engine = create_async_engine(DATABASE_URL)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency que fornece uma sessao async."""
```

Usa `asyncpg` como driver assincrono para PostgreSQL.

### Tabelas ORM (`tables.py`)

Cinco tabelas definidas com SQLAlchemy + GeoAlchemy2:

- `ProjectTable` -- projetos com bounds (POLYGON) e center (POINT)
- `NodeTable` -- nos com geometry (POINT), elevation, node_type, accessory_type
- `EdgeTable` -- arestas com geometry (LINESTRING), length, slope, cost
- `PipeSegmentTable` -- segmentos dimensionados (diâmetro, Manning, lâmina, etc.)
- `PumpStationTable` -- elevatorias (capacidade, altura, CAPEX, OPEX, VPL)

Todas as FKs usam `CASCADE` no delete. Detalhes completos em `docs/04-banco-de-dados.md`.

### Repository (`repositories.py`)

```python
class ProjectRepository:
    def __init__(self, session: AsyncSession): ...

    async def upsert(self, data: dict) -> ProjectTable:
        """Insere ou atualiza projeto. Converte bounds/center para PostGIS."""

    async def get_all(self) -> list[ProjectTable]:
        """Retorna todos os projetos."""

    async def get_by_id(self, project_id: str) -> ProjectTable | None:
        """Busca projeto por ID."""

    async def delete(self, project_id: str) -> bool:
        """Deleta projeto e dados relacionados. Retorna True se encontrado."""
```

Metodos internos de conversao:
- `_bbox_to_polygon(bounds)` -> `ST_SetSRID(ST_MakeEnvelope(west, south, east, north), 4326)`
- `_center_to_point(center)` -> `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`

## Conversao PostGIS <-> NetworkX (`core/graph/builder.py`)

### `build_graph_from_postgis(project_id, session) -> nx.Graph`

1. Consulta `NodeTable` para o projeto, extrai `ST_X` (lng), `ST_Y` (lat) e atributos
2. Consulta `EdgeTable`, le `source_node_id` e `target_node_id` do campo JSONB `properties`
3. Retorna grafo nao-direcionado NetworkX com:
   - Nos: `{x, y, z, node_type, pv_obrigatorio, is_intersection, is_endpoint, degree}`
   - Arestas: `{edge_id, length_m, name, highway, slope, cost}`

### `save_graph_to_postgis(project_id, G, session) -> None`

1. Remove todos os nos e arestas existentes para o projeto
2. Para cada no em `G`: cria `Point(x, y)` com SRID 4326 e insere `NodeTable`
3. Para cada aresta `(u, v, data)` em `G`: cria `LineString([(u.x, u.y), (v.x, v.y)])` e insere `EdgeTable`

## Servicos Externos

### OpenTopography (`services/elevation.py`)

Endpoint: `https://portal.opentopography.org/API/globaldem`

DEMs suportados:
- `SRTMGL3` (90m), `SRTMGL1` (30m)
- `COP30` (30m, **padrao**), `COP90` (90m)
- `AW3D30` (30m), `NASADEM` (30m)
- `EU_DTM`, `GEDI_L3`, `FABDEM`

Constantes:
- `NODATA_THRESHOLD = -9000` -- valores abaixo sao tratados como ausentes
- Timeout: 120s
- Limite de area: `MAX_AREA_KM2` (100 km2)

Requer variavel de ambiente `OPENTOPOGRAPHY_API_KEY`.

### Overpass (`services/overpass.py`)

Stub atual -- a consulta Overpass e feita diretamente pelo frontend em `POST /api/streets`. O plano e migrar para o backend com cache em disco (ver `URBANUS_REFATORACAO_PIPELINE_DADOS.md`).
