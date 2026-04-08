# 02 -- Tipos Geoespaciais e Constantes

## Principio

Cada ecossistema (TypeScript e Python) mantem sua propria implementacao dos tipos geoespaciais. O contrato -- nomes de tipos, campos e semantica -- e identico entre ambos.

## Tipos Canonicos TypeScript (`@urbanus/geo`)

Localizacao: `packages/geo/src/types.ts`

### Tipos Base

```typescript
interface LatLng {
  lat: number;
  lng: number;
}

interface BoundingBox {
  southWest: LatLng;
  northEast: LatLng;
}

interface BboxDimensions {
  widthKm: number;
  heightKm: number;
}
```

### Tipos de Validacao

```typescript
interface ValidationError {
  code: string;
  message: string;
  field?: string;
}

interface ValidationWarning {
  code: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings?: ValidationWarning[];
}
```

### Enumeracoes de Dominio

```typescript
type NodeType = "MANDATORY" | "INTERMEDIATE" | "REDUNDANT" | "HIGH_POINT" | "LOW_POINT";
```

| Tipo | Significado |
|------|-------------|
| `MANDATORY` | No estruturalmente preservado ou obrigatorio para o pipeline |
| `INTERMEDIATE` | No intermediario/transitorio inserido por sanitizacao |
| `REDUNDANT` | No identificado para remocao ou merge |
| `HIGH_POINT` | Maximo local de elevacao relevante |
| `LOW_POINT` | Minimo local de elevacao relevante |

```typescript
type AccessoryType = "PV";
```

| Tipo | Nome Completo |
|------|---------------|
| `PV` | Poco de Visita |

`isCollectionPoint` permanece separado de `accessoryType` e identifica o papel
do no como ponto de coleta no roteamento.

Snapshots legados ainda podem conter `ROSA`, `VERDE`, `VERMELHO`, `AMARELO` e
`AZUL_ESCURO`; o backend normaliza esses aliases para os nomes acima.

### Tipos da Rede de Esgoto

```typescript
interface SewerNode {
  id: string;
  lat: number;
  lng: number;
  elevation: number | null;
  nodeType: NodeType | null;
  pvObrigatorio: boolean;
  degree: number;
  isIntersection: boolean;
  isEndpoint: boolean;
  isCollectionPoint: boolean;
  accessoryType: AccessoryType | null;
}

interface SewerEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  lengthM: number;
  slope: number | null;       // m/m, positivo = descendente
  name: string | null;        // nome da rua (OSM)
  highway: string | null;     // tipo de via (OSM)
}

interface SewerNetwork {
  projectId: string;
  nodes: SewerNode[];
  edges: SewerEdge[];
  unreachableNodes: string[];  // IDs sem caminho gravitacional
}
```

## Tipos Canonicos Python (`urbanus-geo`)

Localizacao: `py/urbanus-geo/src/urbanus_geo/types.py`

Equivalentes Pydantic dos tipos TypeScript. Todos os modelos herdam de `pydantic.BaseModel` com validacao em runtime.

```python
class LatLng(BaseModel):
    lat: float
    lng: float

class BoundingBox(BaseModel):
    southWest: LatLng
    northEast: LatLng

class NodeType(str, Enum):
    MANDATORY = "MANDATORY"
    INTERMEDIATE = "INTERMEDIATE"
    REDUNDANT = "REDUNDANT"
    HIGH_POINT = "HIGH_POINT"
    LOW_POINT = "LOW_POINT"

class AccessoryType(str, Enum):
    PV = "PV"

class SewerNode(BaseModel):
    id: str
    lat: float
    lng: float
    elevation: float | None = None
    node_type: NodeType | None = None
    pv_obrigatorio: bool = False
    degree: int = 0
    is_intersection: bool = False
    is_endpoint: bool = False
    is_collection_point: bool = False
    accessory_type: AccessoryType | None = None

class SewerEdge(BaseModel):
    id: str
    source_node_id: str
    target_node_id: str
    length_m: float
    slope: float | None = None
    name: str | None = None
    highway: str | None = None

class SewerNetwork(BaseModel):
    project_id: str
    nodes: list[SewerNode]
    edges: list[SewerEdge]
    unreachable_nodes: list[str]
```

## Constantes NBR 9649 -- Hidraulica

Definidas em `packages/constants/src/hydraulics.ts` (JS) e `py/urbanus-geo/src/urbanus_geo/constants.py` (Python).

| Constante | Valor | Unidade | Significado |
|-----------|-------|---------|-------------|
| `MANNING_N_DEFAULT` | 0.013 | -- | Coeficiente de Manning (todos os materiais com biofilme) |
| `MANNING_N_PVC` | 0.010 | -- | Coeficiente de Manning para PVC novo |
| `GAMMA_WATER` | 9810 | N/m3 | Peso especifico da agua |
| `MIN_COVER_STREET` | 0.90 | m | Recobrimento minimo sob rua |
| `MIN_COVER_SIDEWALK` | 0.65 | m | Recobrimento minimo sob calcada |
| `MAX_PV_SPACING` | 100 | m | Espacamento maximo entre PVs |
| `MIN_PV_SPACING` | 80 | m | Espacamento minimo entre PVs |
| `PER_CAPITA_CONSUMPTION` | 150 | L/hab/dia | Consumo per capita (estimativa conservadora) |
| `RETURN_COEFFICIENT` | 0.80 | -- | Coeficiente de retorno (esgoto/agua) |
| `K1_MAX_DAILY` | 1.2 | -- | Coeficiente de maximo diario |
| `K2_MAX_HOURLY` | 1.5 | -- | Coeficiente de maximo horario |

## Constantes do Pipeline

Definidas em `packages/constants/src/pipeline.ts` (JS) e `py/urbanus-geo/src/urbanus_geo/constants.py` (Python).

| Constante | Valor | Unidade | Etapa | Significado |
|-----------|-------|---------|-------|-------------|
| `LONG_EDGE_MAX_DISTANCE` | 100.0 | m | 2 | Limiar para subdivisao de arestas |
| `REDUNDANT_NODE_MIN_DISTANCE` | 20.0 | m | 3 | Distancia minima para remocao de no redundante |
| `CURVE_ANGLE_THRESHOLD` | 150.0 | graus | 4 | Ângulo de deflexao que dispara PV em curva |
| `ELEVATION_PROMINENCE_MIN` | 2.0 | m | 5 | Proeminencia minima para pico/vale |
| `DIRECTION_CHANGE_THRESHOLD` | 45.0 | graus | -- | Mudanca de direcao que exige PV |
| `SLOPE_PENALTY` | 10.0 | -- | 6 | Penalidade de roteamento para declividade insuficiente |
| `REUSE_BONUS` | 0.5 | -- | 6 | Multiplicador de desconto para reutilizacao de aresta |

## Constantes Auxiliares

### Limites de Area (`packages/constants/src/area.ts`)

| Constante | Valor | Significado |
|-----------|-------|-------------|
| `MAX_BBOX_AREA_KM2` | 100 | Area maxima selecionavel |
| `MIN_BBOX_AREA_KM2` | 0.001 | Area minima selecionavel |
| `BBOX_AREA_WARNING_THRESHOLD` | 50 | Aviso ao usuario se area > 50 km2 |

### Restricoes de Nos (`packages/constants/src/nodes.ts`)

| Constante | Valor | Significado |
|-----------|-------|-------------|
| `MIN_DISTANCE_METERS` | 1 | Distancia minima entre nos |
| `MAX_MOVE_DISTANCE_METERS` | 500 | Distancia maxima de ajuste manual |
| `SNAP_DISTANCE_METERS` | 5 | Tolerancia de snap |

### Rate Limits (`packages/constants/src/rate-limits.ts`)

| Servico | Limite | Janela |
|---------|--------|--------|
| Streets (Overpass) | 10 req | 60s |
| Topography (OpenTopography) | 5 req | 60s |
| Node operations | 100 ops | 60s |

### Defaults (`packages/constants/src/defaults.ts`)

| Constante | Valor | Significado |
|-----------|-------|-------------|
| `DEFAULT_CENTER` | [-23.5505, -46.6333] | Sao Paulo, Brasil |
| `DEFAULT_ZOOM` | 13 | Zoom inicial do mapa |
| `ELEVATION_CACHE.TTL_MS` | 1800000 | TTL do cache de elevacao (30 min) |
| `ELEVATION_CACHE.MAX_ENTRIES` | 10 | Maximo de entradas no cache |

## Utilitarios Compartilhados (`@urbanus/utils`)

Localizacao: `packages/utils/src/`

### RateLimiter

Sliding window rate limiter sem dependencia de React.

```typescript
class RateLimiter {
  register(key: string, config: { maxRequests: number; windowMs: number }): void;
  acquire(key: string): { allowed: boolean; retryAfter?: number };
  getStatus(key: string): { remaining: number; total: number; resetIn: number; blocked: boolean } | null;
  reset(key: string): void;
  resetAll(): void;
}
```

### withRetry / fetchWithRetry

Retry com exponential backoff.

```typescript
interface RetryOptions {
  maxRetries?: number;           // default: 3
  initialDelay?: number;         // default: 1000 ms
  maxDelay?: number;             // default: 30000 ms
  backoffMultiplier?: number;    // default: 2
  retryCondition?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown, delay: number) => void;
}

function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>;
function fetchWithRetry(url: string, options?: RequestInit, retryOptions?: RetryOptions): Promise<Response>;
function isRetryableError(error: unknown): boolean;  // 5xx, 429, network, timeout
```

### throttle

Throttle com leading + trailing edge.

```typescript
function throttle<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void;
```
