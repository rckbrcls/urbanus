# URBANUS — Documentação Técnica Completa

> Documento para deep research e validação de produto.
> Gerado a partir da análise completa do código-fonte em 2026-03-16.

---

## 1. Visão Geral do Produto

O URBANUS é uma plataforma web de planejamento urbano que permite:

1. **Selecionar uma área no mapa** (bounding box via Shift+Drag)
2. **Buscar ruas reais** da região via OpenStreetMap (Overpass API)
3. **Enriquecer com dados topográficos** (elevação via OpenTopography)
4. **Extrair e editar nós** (interseções e vértices das ruas)
5. **Salvar projetos** com todos os dados processados

**Stack tecnológico:**
- **Frontend:** Next.js 16 (App Router) + React 19 + Leaflet + Zustand + TailwindCSS
- **Backend:** FastAPI (Python 3.11) + MongoDB (Motor async) + rasterio + numpy
- **Infra:** Docker Compose (client + server + mongo)

---

## 2. Arquitetura Geral

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                    │
│                                                         │
│  ┌─────────┐   ┌──────────────┐   ┌─────────────────┐  │
│  │ Map.tsx  │──▶│  MapContext   │──▶│    Services     │  │
│  │ (Leaflet)│   │  (Reducer)   │   │ (Singletons)   │  │
│  └─────────┘   └──────────────┘   └────────┬────────┘  │
│                                             │           │
│  ┌──────────────────────────────────────────┘           │
│  │ API Routes (Next.js)                                 │
│  │  POST /api/streets        → Overpass API             │
│  │  POST /api/elevation/enrich → Proxy p/ FastAPI       │
│  │  POST /api/nodes/extract    → Proxy p/ FastAPI       │
│  └──────────────────────────────────────────────────────│
└─────────────────────────┬───────────────────────────────┘
                          │ HTTP
┌─────────────────────────▼───────────────────────────────┐
│                   BACKEND (FastAPI)                       │
│                                                          │
│  POST /elevation/enrich  → OpenTopography → rasterio     │
│  POST /nodes/extract     → Algoritmo de extração         │
│  CRUD /projects          → MongoDB                       │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Pipeline de Processamento (Fluxo Principal)

Quando o usuário confirma uma área no mapa, o sistema executa 3 estágios sequenciais:

### Estágio 1: Busca de Ruas (Streets)

**Rota:** `POST /api/streets` (Next.js)

1. Recebe bounding box (south, north, west, east)
2. Calcula área e valida (máx. 100 km²)
3. Monta query Overpass:
   ```
   [out:json][timeout:30];
   (way["highway"~"^(motorway|trunk|primary|secondary|tertiary|
     residential|unclassified)$"](south,west,north,east););
   out body; >; out skel qt;
   ```
4. Faz fetch com timeout de 35s
5. Converte resposta para GeoJSON:
   - Separa `nodes` (id→[lon,lat]) e `ways`
   - Para cada way, constrói `LineString` a partir dos node refs
   - Extrai propriedades: `id`, `name`, `highway`, `surface`, `lanes`, `maxspeed`, `oneway`
   - Filtra ways com < 2 coordenadas
6. Retorna `FeatureCollection` com metadados (totalStreets, areaKm2, bounds)

**Tipos de highway aceitos:** motorway, trunk, primary, secondary, tertiary, residential, unclassified

### Estágio 2: Enriquecimento Topográfico (Elevation)

**Rota:** `POST /api/elevation/enrich` (Next.js) → `POST /elevation/enrich` (FastAPI)

**Algoritmo no backend (elevation.py):**

1. Valida DEM type (default: `COP30`, fallback se inválido)
2. Valida área (≤ 100 km²)
3. Verifica `OPENTOPOGRAPHY_API_KEY`
4. **Faz download do GeoTIFF** da OpenTopography:
   - URL: `https://portal.opentopography.org/API/globaldem`
   - Parâmetros: `demtype=COP30`, bbox, `outputFormat=GTiff`
   - Timeout: 120s
5. **Abre GeoTIFF em memória** (rasterio MemoryFile — sem escrita em disco)
6. **Extrai nodata value** dos metadados do raster
7. **Para cada feature (LineString):**
   - Converte coordenadas para pares (lon, lat)
   - **Amostra elevação em cada vértice** via `rasterio.sample()`
   - Validação: valor > -9000 e ≠ nodata → válido; senão → `null`
   - Calcula estatísticas: `min`, `max`, `avg`, `range`
   - Injeta nas properties:
     ```json
     {
       "vertex_elevations": [100.5, 102.3, 105.1, null, 103.2],
       "elevation": {"min": 100.5, "max": 105.1, "avg": 102.8, "range": 4.6}
     }
     ```
8. Retorna FeatureCollection enriquecida

**DEMs disponíveis:** SRTMGL3, SRTMGL1, COP30, COP90, AW3D30, NASADEM, EU_DTM, GEDI_L3

### Estágio 3: Extração de Nós (Nodes)

**Rota:** `POST /api/nodes/extract` (Next.js) → `POST /nodes/extract` (FastAPI)

**Algoritmo no backend (nodes.py):**

#### Fase 1 — Construção do Position Map (cálculo de grau)

```python
position_map = {}
for feature in features:
    street_id = feature.properties.id
    street_name = feature.properties.name
    for (lon, lat) in coordinates:
        key = f"{lat:.6f},{lng:.6f}"   # 6 decimais ≈ 0.11m precisão
        position_map[key].street_ids.add(street_id)
        position_map[key].street_names.add(street_name)
```

O **grau** de cada posição = número de street_ids únicos naquela posição.

#### Fase 2 — Geração dos Nós

Para cada feature e cada coordenada:
- Consulta position_map para obter grau e ruas conectadas
- Determina:
  - `isIntersection`: grau ≥ 2
  - `isEndpoint`: primeiro ou último vértice da LineString
- **Filtra por modo:**
  - `"intersections"` (padrão): apenas nós com grau ≥ 2
  - `"all"`: todos os vértices (para edição completa)
- Extrai elevação do array `vertex_elevations` no índice correspondente

#### Fase 3 — Marcação de Extremos de Elevação

- Apenas entre **interseções** (grau ≥ 2):
  - Identifica o nó com maior elevação → `isHighestElevation = true`
  - Identifica o nó com menor elevação → `isLowestElevation = true`

#### Estrutura do Nó Retornado

```json
{
  "id": "uuid",
  "position": {"lat": -23.55, "lng": -46.68},
  "elevation": 102.3,
  "degree": 3,
  "isIntersection": true,
  "isEndpoint": false,
  "connectedStreets": ["street-id-1", "street-id-2", "street-id-3"],
  "streetNames": ["Rua Principal", "Av. Secundária"],
  "streetId": "street-uuid",
  "streetName": "Rua Principal",
  "highway": "residential",
  "vertexIndex": 1,
  "isHighestElevation": false,
  "isLowestElevation": false
}
```

#### Metadados Retornados

```json
{
  "totalVertices": 250,
  "totalUniquePositions": 180,
  "filteredNodes": 45,
  "highestElevationNodeId": "uuid",
  "lowestElevationNodeId": "uuid",
  "highestElevation": 120.5,
  "lowestElevation": 85.2
}
```

---

## 4. Regras de Negócio e Limites

### 4.1 Limites de Área

| Regra | Valor | Onde é Aplicada |
|-------|-------|-----------------|
| Área máxima | 100 km² | Client (BboxValidator), API /streets, API /elevation, server/elevation.py |
| Área mínima | 0.001 km² | Client (BboxValidator) |
| Limiar de aviso | 50 km² | Client (BboxValidator) — mostra warning mas permite |

**Fórmula de cálculo de área:**
```
avgLat = (north + south) / 2
kmPerDegreeLon = 111.32 × cos(avgLat × π/180)
área = (north - south) × 111.32 × (east - west) × kmPerDegreeLon
```

### 4.2 Restrições de Nós

| Regra | Valor | Descrição |
|-------|-------|-----------|
| Distância mínima entre nós | 1 metro | Impede sobreposição |
| Distância máxima de movimento | 500 metros | Previne erros acidentais |
| Distância de snap | 5 metros | Sugere encaixe no nó mais próximo |
| Precisão posicional | 6 casas decimais | ≈ 0.11m de resolução |
| Histórico máximo (undo) | 100 ações | Stack com limite |

### 4.3 Rate Limiting

| Endpoint | Limite | Janela |
|----------|--------|--------|
| Streets (Overpass) | 10 req | por minuto |
| Topography (OpenTopography) | 5 req | por minuto |
| Node operations | 100 ops | por minuto |

Algoritmo: **Sliding window** com bloqueio e retry automático.

### 4.4 Retry Logic

- **Tentativas:** 3 (com backoff exponencial)
- **Delay inicial:** 1–2 segundos
- **Multiplicador:** 2x
- **Delay máximo:** 30 segundos
- **Erros retentáveis:** 5xx, 429 (rate limit), erros de rede, timeout, erros do Overpass

### 4.5 Regras de Validação de Nós

**Para mover um nó:**
1. Se nó está travado → NODE_LOCKED (erro)
2. Se nova posição fora do bbox → OUTSIDE_BOUNDS (erro)
3. Se < 1m de outro nó → TOO_CLOSE (aviso)
4. Se movimento > 500m → LARGE_MOVE (aviso)
5. Se é interseção → INTERSECTION_MODIFIED (aviso)
6. Se < 5m do nó mais próximo → sugere snap

**Para deletar um nó:**
- Se nó está travado → NODE_LOCKED (erro)
- Se é endpoint → CANNOT_DELETE_ENDPOINT (erro)

**Para criar um nó:**
- Se fora do bbox → erro
- Se < 1m de outro nó → erro

---

## 5. Modelo de Dados

### 5.1 MapNode (Frontend)

```typescript
interface MapNode {
  id: string;                     // UUID
  position: { lat: number; lng: number };
  elevation: number | null;
  streetId: string;
  streetName?: string;
  vertexIndex: number;            // Índice na LineString
  highway?: string;               // Tipo OSM (residential, primary, etc.)
  isEndpoint: boolean;
  isIntersection?: boolean;
  connectedStreets?: string[];
  degree?: number;
  isHighestElevation?: boolean;
  isLowestElevation?: boolean;
  // Estado de UI:
  isSelected: boolean;
  isHovered: boolean;
  isDragging: boolean;
  isLocked?: boolean;
  createdAt: number;
  updatedAt: number;
}
```

### 5.2 EnrichedStreetProperties (GeoJSON enriquecido)

```typescript
interface EnrichedStreetProperties {
  id: number;
  name: string | null;
  highway: string;
  surface: string | null;
  lanes: number | null;
  maxspeed: string | null;
  oneway: boolean;
  vertex_elevations: (number | null)[];  // Elevação por vértice
  elevation: {
    min: number | null;
    max: number | null;
    avg: number | null;
    range: number | null;
  };
}
```

### 5.3 Project (MongoDB)

```typescript
interface Project {
  id: string;                  // UUID
  name: string;
  createdAt: number;           // Unix timestamp
  bounds: BoundingBox;
  areaKm2: number;
  center: [number, number];    // [lat, lng]
  zoom: number;
  stats: { streetCount: number };
  streets: GeoJSON.FeatureCollection;  // GeoJSON completo
}
```

### 5.4 NodeAction (Undo/Redo)

```typescript
interface NodeAction {
  type: "move" | "delete" | "create" | "batch";
  nodeId: string;
  previousState: object;
  newState: object;
  timestamp: number;
  batchActions?: NodeAction[];  // Para operações em lote
}
```

---

## 6. Algoritmos Geoespaciais

### 6.1 Distância Haversine

Usado para calcular distâncias entre nós:
```
R = 6.371.000 metros (raio da Terra)
dLat = (lat2 - lat1) × π/180
dLng = (lng2 - lng1) × π/180
a = sin²(dLat/2) + cos(lat1 × π/180) × cos(lat2 × π/180) × sin²(dLng/2)
distância = R × 2 × atan2(√a, √(1-a))
```

### 6.2 Detecção de Nós Co-localizados

Múltiplas ruas podem se cruzar no mesmo ponto. Para identificar:
```typescript
getColocatedNodeIds(nodes, targetNode): Set<string>
  - Arredonda coordenadas para 6 casas decimais
  - Retorna todos os IDs de nós com posição idêntica
```

### 6.3 Amostragem de Elevação (rasterio)

Para cada coordenada (lon, lat) de uma LineString:
```python
sample = src.sample([(lon, lat)])
value = np.atleast_1d(arr)[0]
if value > -9000 and value != nodata:
    return float(value)  # metros
else:
    return None
```

### 6.4 Reconstrução de Geometria (applyNodesToStreets)

Quando nós são editados, a geometria da rua precisa ser atualizada:
1. Agrupa nós por `streetId`
2. Ordena por `vertexIndex`
3. Reconstrói array de coordenadas da LineString
4. Atualiza array `vertex_elevations`
5. Marca feature como modificada

---

## 7. Visualização e UI

### 7.1 Modos de Visualização

| Modo | Descrição |
|------|-----------|
| `explore` | Mapa completo, pode desenhar bbox com Shift+Drag |
| `select` | Seleção ativa (durante o desenho do bbox) |
| `edit` | Edição do bbox antes de confirmar |
| `cropped` | Visão recortada após confirmação, mostra ruas e nós |

### 7.2 Cores por Tipo de Via (Highway)

| Tipo | Cor | Hex |
|------|-----|-----|
| motorway | Vermelho | #e11d48 |
| trunk | Laranja | #f97316 |
| primary | Amarelo | #eab308 |
| secondary | Verde | #22c55e |
| tertiary | Azul | #3b82f6 |
| residential | Roxo | #8b5cf6 |
| unclassified | Cinza | #6b7280 |

### 7.3 Estilos de Nós

| Tipo | Cor | Raio | Quando |
|------|-----|------|--------|
| default | cinza | 6px | Nó normal |
| endpoint | âmbar (#f59e0b) | 8px | Início/fim de rua |
| intersection | violeta (#8b5cf6) | 8px | Grau ≥ 2 |
| highestElevation | vermelho (#ef4444) | 12px | Maior elevação |
| lowestElevation | ciano (#06b6d4) | 12px | Menor elevação |
| selected | azul | 10px | Selecionado |
| hovered | violeta | 9px | Mouse em cima |
| dragging | verde | 11px | Sendo arrastado |

### 7.4 Centro Padrão do Mapa

- **Localização:** São Paulo — `[-23.5505, -46.6333]`
- **Zoom padrão:** 13
- **Tiles:** CartoDB

---

## 8. Sistema de Undo/Redo

- **Stack máximo:** 100 ações
- **Operações em lote** contam como 1 ação (ex: deletar 5 nós = 1 undo)
- **Nova ação** limpa o redo stack
- **Tipos de ação:** `move`, `delete`, `create`, `batch`
- **Batch undo:** desfaz na ordem reversa

---

## 9. Gestão de Estado (Frontend)

### 9.1 MapContext (Reducer Pattern)

Estado centralizado com ~30+ actions:

| Categoria | Actions |
|-----------|---------|
| Bbox | setPendingBbox, confirmBbox, cancelBbox, clearBbox |
| View | setViewMode |
| Processing | startProcessing, cancelProcessing, setStage, setError |
| Nodes | setNodes, selectNode, moveNode, deleteNode, undo, redo |
| Data | setStreetsData, enrichStreetsWithElevation, applyNodeChanges |
| UI | setShowCropConfirm, setShowSaveDialog, setValidationError |

### 9.2 Stores Persistentes

- **useMapStore** (Zustand + persist): centro e zoom do mapa — key: `"map-storage"`
- **useProjectStore** (React Query): CRUD de projetos via `/api/projects` (FastAPI)

---

## 10. Tratamento de Erros

### Classes de Erro

| Classe | Códigos |
|--------|---------|
| StreetsError | FETCH_ERROR, RATE_LIMITED, PARSE_ERROR, UNKNOWN_ERROR |
| ElevationError | FETCH_ERROR, RATE_LIMITED, PROCESSING_ERROR, UNKNOWN_ERROR |
| NodeOperationError | NODE_NOT_FOUND, NODE_LOCKED, etc. |

### Fluxo de Erro

```
Service lança erro tipado
  → MapContext captura e identifica o estágio falho
  → Seta stage = "error" + mensagem
  → UI exibe overlay com nome do estágio + mensagem
  → Usuário pode clicar "Retry"
```

---

## 11. API Contracts Completos

### POST /api/streets

**Request:** `{ south, north, west, east: number }`

**Response:**
```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "geometry": {
      "type": "LineString",
      "coordinates": [[lng, lat], ...]
    },
    "properties": {
      "id": 123456,
      "name": "Rua das Flores",
      "highway": "residential",
      "surface": "asphalt",
      "lanes": 2,
      "maxspeed": "40",
      "oneway": false
    }
  }],
  "metadata": {
    "totalStreets": 150,
    "areaKm2": 12.5,
    "bounds": { "south": -23.55, "north": -23.54, "west": -46.68, "east": -46.67 }
  }
}
```

### POST /elevation/enrich

**Request:**
```json
{
  "geojson": { "type": "FeatureCollection", "features": [...] },
  "bbox": { "south": -23.55, "north": -23.54, "west": -46.68, "east": -46.67 },
  "demType": "COP30"
}
```

**Response:** Mesmo FeatureCollection com `vertex_elevations` e `elevation` adicionados a cada feature.

### POST /nodes/extract

**Request:**
```json
{
  "geojson": { "type": "FeatureCollection", "features": [...] },
  "mode": "intersections"
}
```

**Response:**
```json
{
  "nodes": [
    {
      "id": "uuid",
      "position": {"lat": -23.55, "lng": -46.68},
      "elevation": 102.3,
      "degree": 3,
      "isIntersection": true,
      "isEndpoint": false,
      "connectedStreets": ["id-1", "id-2", "id-3"],
      "streetNames": ["Rua Principal", "Av. Secundária"],
      "streetId": "street-uuid",
      "streetName": "Rua Principal",
      "highway": "residential",
      "vertexIndex": 1,
      "isHighestElevation": false,
      "isLowestElevation": false
    }
  ],
  "metadata": {
    "totalVertices": 250,
    "totalUniquePositions": 180,
    "filteredNodes": 45,
    "highestElevationNodeId": "uuid",
    "lowestElevationNodeId": "uuid",
    "highestElevation": 120.5,
    "lowestElevation": 85.2
  }
}
```

### CRUD /projects

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | /projects | Cria/atualiza projeto (upsert) |
| GET | /projects | Lista todos os projetos |
| GET | /projects/{id} | Busca projeto por ID |
| DELETE | /projects/{id} | Remove projeto |

---

## 12. Infraestrutura e Deploy

### Docker Compose

| Serviço | Porta Host | Porta Container | Imagem |
|---------|-----------|-----------------|--------|
| client | — | 3000 | Node.js (Next.js) |
| server | 8000 | 8000 | Python 3.11-slim + GDAL |
| mongo | 27018 | 27017 | mongo:latest |

### Variáveis de Ambiente

| Variável | Usado por | Default | Obrigatório |
|----------|-----------|---------|-------------|
| OPENTOPOGRAPHY_API_KEY | server | — | Sim (para elevação) |
| PYTHON_API_URL | client | http://localhost:8000 | Não |
| MONGO_URL | server | mongodb://localhost:27018/urbanus | Não |

### Dependências do Server (Dockerfile)

O Dockerfile instala GDAL e libs geoespaciais para suportar rasterio:
- `gdal-bin`, `libgdal-dev` — processamento raster
- `libproj-dev`, `libgeos-dev` — projeções e geometrias
- `g++`, `libexpat1` — build tools

---

## 13. Fluxo Completo do Usuário

```
1. Usuário abre o mapa (centro: São Paulo, zoom: 13)
2. Shift+Drag para desenhar retângulo de seleção
3. Sistema calcula área e valida (0.001 ≤ área ≤ 100 km²)
4. Usuário confirma a seleção → viewMode muda para "cropped"
5. Clica "Fetch Data" → pipeline de 3 estágios:
   a. Streets: busca ruas do OpenStreetMap (Overpass API)
   b. Topography: enriquece com elevação (OpenTopography → rasterio)
   c. Nodes: extrai interseções (position map + degree)
6. Ruas renderizadas com cores por tipo de via
7. Nós renderizados com cores por tipo (interseção, endpoint, extremos)
8. Usuário pode:
   - Selecionar nós (click, Shift+click, seleção por região)
   - Mover nós (drag) com validação e snap
   - Deletar nós (exceto endpoints)
   - Undo/Redo (Ctrl+Z / Ctrl+Shift+Z)
   - Salvar como projeto (nome + dados → MongoDB)
```

---

## 14. Pontos de Atenção e Limitações Atuais

1. **Sem testes automatizados** — apenas `pnpm lint` no frontend
2. **URL hardcoded** — `useProjectStore.ts` usa `http://localhost:8000` direto
3. **Leaflet apenas client-side** — carregado via `dynamic()` com `ssr: false`
4. **CORS totalmente aberto** — `allow_origins=["*"]` no FastAPI (dev only)
5. **Sem autenticação** — endpoints abertos
6. **Limite de 100 km²** duplicado em 4 lugares (client validator, api/streets, api/topography, server/elevation.py)
7. **Elevação null** — pode ocorrer para vértices fora da cobertura do DEM ou em áreas com nodata
8. **Extremos de elevação** — calculados apenas entre interseções (grau ≥ 2), ignoram endpoints
