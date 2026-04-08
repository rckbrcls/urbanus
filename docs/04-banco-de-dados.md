# 04 -- Banco de Dados (PostGIS)

## Decisao Tecnica: PostGIS em vez de MongoDB

A versao inicial do projeto usava MongoDB para armazenamento de dados geoespaciais. A migracao para PostgreSQL + PostGIS foi motivada por:

1. **Indices espaciais GiST**: consultas espaciais nativas (`ST_Within`, `ST_Intersects`, `ST_DWithin`) com desempenho superior a indices 2dsphere do MongoDB para operacoes de vizinhanca e contencao
2. **Integridade referencial**: chaves estrangeiras com cascade delete garantem consistencia entre projetos, nos e arestas
3. **Tipos geometricos nativos**: `POINT`, `LINESTRING`, `POLYGON` com SRID 4326 (WGS84) sao cidadaos de primeira classe, nao wrappers sobre arrays de coordenadas
4. **Ecossistema Python**: integracao direta com SQLAlchemy (GeoAlchemy2), Alembic, Shapely e rasterio
5. **Transacoes ACID**: operacoes de pipeline que modificam centenas de nos/arestas atomicamente

## SRID e Sistema de Coordenadas

Todas as geometrias usam **SRID 4326** (WGS84), que e o sistema de coordenadas nativo do GPS, OpenStreetMap e OpenTopography. As coordenadas sao armazenadas como `(longitude, latitude)` -- a convencao geoespacial `(x, y)`, diferente da convencao cartografica `(lat, lng)`.

## Schema Completo

### Tabela `projects`

Armazena metadados do projeto e o GeoJSON bruto das ruas.

| Coluna | Tipo | Constraint | Descricao |
|--------|------|------------|-----------|
| `id` | String | PK | UUID do projeto |
| `name` | Text | NOT NULL | Nome do projeto |
| `created_at` | BigInteger | NOT NULL | Timestamp Unix (ms) |
| `bounds` | Geometry(POLYGON, 4326) | -- | Bounding box como poligono |
| `area_km2` | Double | NOT NULL | Area em km2 |
| `center` | Geometry(POINT, 4326) | -- | Centro do projeto |
| `zoom` | Double | NOT NULL | Nivel de zoom do mapa |
| `street_count` | Integer | default 0 | Numero de ruas |
| `streets_geojson` | JSONB | -- | FeatureCollection com metadados `_bounds`, `_center` |

Relacionamentos:
- `nodes` -> NodeTable (cascade delete)
- `edges` -> EdgeTable (cascade delete)

### Tabela `nodes`

Nos da rede (intersecoes, intermediarios, extremidades).

| Coluna | Tipo | Constraint | Descricao |
|--------|------|------------|-----------|
| `id` | String | PK | UUID do no |
| `project_id` | String | FK -> projects (CASCADE) | Projeto pai |
| `geometry` | Geometry(POINT, 4326) | NOT NULL | Posicao (lng, lat) |
| `elevation` | Double | -- | Cota do terreno (m) |
| `degree` | Integer | -- | Numero de arestas conectadas |
| `is_intersection` | Boolean | default false | Grau >= 2 |
| `is_endpoint` | Boolean | default false | Primeiro ou ultimo vertice |
| `node_type` | Text | -- | MANDATORY, INTERMEDIATE, REDUNDANT, HIGH_POINT, LOW_POINT |
| `pv_obrigatorio` | Boolean | default false | PV obrigatorio neste no |
| `accessory_type` | Text | -- | PV (valores antigos podem existir em rows legadas) |
| `properties` | JSONB | -- | Metadados adicionais |

Indices:
- `idx_nodes_project` (project_id) -- busca por projeto
- `idx_nodes_geom` (geometry, GiST) -- consultas espaciais

### Tabela `edges`

Arestas da rede (trechos entre nos, correspondentes a segmentos de rua).

| Coluna | Tipo | Constraint | Descricao |
|--------|------|------------|-----------|
| `id` | String | PK | UUID da aresta |
| `project_id` | String | FK -> projects (CASCADE) | Projeto pai |
| `geometry` | Geometry(LINESTRING, 4326) | NOT NULL | Geometria do trecho |
| `name` | Text | -- | Nome da rua (OSM) |
| `highway` | Text | -- | Tipo de via OSM (residential, primary, etc.) |
| `length_m` | Double | -- | Comprimento em metros |
| `slope` | Double | -- | Declividade m/m |
| `properties` | JSONB | -- | Inclui `source_node_id`, `target_node_id` |

Indices:
- `idx_edges_project` (project_id) -- busca por projeto
- `idx_edges_geom` (geometry, GiST) -- consultas espaciais

O campo `properties` (JSONB) armazena `source_node_id` e `target_node_id` como metadados de conectividade usados pelo runtime para reconstruir e persistir a conectividade da rede processada.

Rows legadas podem conter os aliases por cor; o runtime atual normaliza esses
valores na leitura e na serializacao da rede.

## Diagrama de Relacionamentos

```
projects (1)
    |
    +--< nodes (N)
    |
    +--< edges (N)
```

Todas as relacoes usam `ON DELETE CASCADE` no `project_id`. Ao deletar um projeto, todos os nos e arestas associados sao removidos automaticamente.

## Migracao Alembic

Arquivo: `apps/api/migrations/versions/001_initial_schema.py`

A migracao inicial cria as 3 tabelas ativas (`projects`, `nodes`, `edges`) com suas geometrias, constraints e indices. O PostGIS extension e habilitado automaticamente pela imagem Docker `postgis/postgis:16-3.4`.

Comando para aplicar:

```bash
cd apps/api
uv run alembic upgrade head
```

No Docker, o `entrypoint.sh` executa a migracao automaticamente antes de iniciar o uvicorn.

## Convencoes de Uso

### Geometrias

- Nos: `Point(lng, lat)` -- longitude primeiro (convencao geoespacial)
- Arestas: `LineString([(lng1, lat1), (lng2, lat2)])` -- dois pontos para segmentos simples
- Bounds: `Polygon` criado via `ST_MakeEnvelope(west, south, east, north, 4326)`

### JSONB

O campo `properties` em `nodes` e `edges` armazena metadados nao-estruturados. Em particular, `edges.properties` contem `source_node_id` e `target_node_id`, que sao usados para reconstruir a topologia do grafo sem necessidade de consultas espaciais.

### Indices GiST

Os indices espaciais GiST em `nodes.geometry` e `edges.geometry` otimizam consultas como:
- `ST_DWithin(geometry, point, distance)` -- nos proximos
- `ST_Intersects(geometry, polygon)` -- arestas dentro de uma area
- `ST_Contains(bounds, point)` -- ponto dentro dos limites do projeto
