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
type NodeType = "ROSA" | "VERDE" | "VERMELHO" | "AMARELO" | "AZUL_ESCURO";
```

| Tipo | Cor | Significado |
|------|-----|-------------|
| `ROSA` | Rosa | PV obrigatorio -- intersecao, confluencia, extremidade |
| `VERDE` | Verde | No intermediario -- subdivisao de arestas longas (Etapa 2) |
| `VERMELHO` | Vermelho | No redundante -- marcado para remocao (Etapa 3) |
| `AMARELO` | Amarelo | Ponto alto -- maximo local de elevacao (Etapa 5) |
| `AZUL_ESCURO` | Azul escuro | Ponto baixo -- minimo local de elevacao (Etapa 5) |

```typescript
type AccessoryType = "PV" | "TIL" | "TL" | "CP";
```

| Tipo | Nome Completo |
|------|---------------|
| `PV` | Poco de Visita |
| `TIL` | Terminal de Inspecao e Limpeza |
| `TL` | Terminal de Limpeza |
| `CP` | Caixa de Passagem |

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
  accessoryType: AccessoryType | null;
}

interface SewerEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  lengthM: number;
  slope: number | null;       // m/m, positivo = descendente
  cost: number | null;
  name: string | null;        // nome da rua (OSM)
  highway: string | null;     // tipo de via (OSM)
}

interface PipeSegment {
  edgeId: string;
  diameterMm: number;         // DN em milimetros
  manningN: number;            // coeficiente de Manning
  slope: number;               // m/m
  coverDepth: number;          // recobrimento em metros
  flowDepthRatio: number | null; // y/D (0 a 0.75)
  velocity: number | null;      // m/s
  tractiveStress: number | null; // Pa
  flowRate: number | null;       // L/s
  isPressurized: boolean;       // true = trecho de recalque
}

interface PumpStation {
  id: string;
  nodeId: string;
  capacityLs: number;         // L/s
  headM: number;               // altura manometrica (m)
  capex: number;               // custo de implantacao (R$)
  annualOpex: number;          // custo anual de operacao (R$)
  npv: number | null;          // valor presente liquido (R$)
}

interface SewerNetwork {
  projectId: string;
  nodes: SewerNode[];
  edges: SewerEdge[];
  pipes: PipeSegment[];
  pumpStations: PumpStation[];
  unreachableNodes: string[];  // IDs sem caminho gravitacional
  totalCost: number | null;    // custo total (R$)
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
    ROSA = "ROSA"
    VERDE = "VERDE"
    VERMELHO = "VERMELHO"
    AMARELO = "AMARELO"
    AZUL_ESCURO = "AZUL_ESCURO"

class AccessoryType(str, Enum):
    PV = "PV"
    TIL = "TIL"
    TL = "TL"
    CP = "CP"

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
    accessory_type: AccessoryType | None = None

class SewerEdge(BaseModel):
    id: str
    source_node_id: str
    target_node_id: str
    length_m: float
    slope: float | None = None
    cost: float | None = None
    name: str | None = None
    highway: str | None = None

class PipeSegment(BaseModel):
    edge_id: str
    diameter_mm: int = 150
    manning_n: float = 0.013
    slope: float
    cover_depth: float
    flow_depth_ratio: float | None = None
    velocity: float | None = None
    tractive_stress: float | None = None
    flow_rate: float | None = None
    is_pressurized: bool = False

class PumpStation(BaseModel):
    id: str
    node_id: str
    capacity_ls: float
    head_m: float
    capex: float
    annual_opex: float
    npv: float | None = None

class SewerNetwork(BaseModel):
    project_id: str
    nodes: list[SewerNode]
    edges: list[SewerEdge]
    pipes: list[PipeSegment]
    pump_stations: list[PumpStation]
    unreachable_nodes: list[str]
    total_cost: float | None = None
```

## Constantes NBR 9649 -- Hidraulica

Definidas em `packages/constants/src/hydraulics.ts` (JS) e `py/urbanus-geo/src/urbanus_geo/constants.py` (Python).

| Constante | Valor | Unidade | Significado |
|-----------|-------|---------|-------------|
| `MANNING_N_DEFAULT` | 0.013 | -- | Coeficiente de Manning (todos os materiais com biofilme) |
| `MANNING_N_PVC` | 0.010 | -- | Coeficiente de Manning para PVC novo |
| `GAMMA_WATER` | 9810 | N/m3 | Peso especifico da agua |
| `MIN_TRACTIVE_STRESS` | 1.0 | Pa | Tensao trativa minima (n=0.013) |
| `MIN_TRACTIVE_STRESS_PVC` | 0.6 | Pa | Tensao trativa minima (n=0.010) |
| `MAX_FLOW_DEPTH_RATIO` | 0.75 | -- | Lâmina maxima y/D |
| `MAX_VELOCITY` | 5.0 | m/s | Velocidade maxima |
| `MIN_FLOW_RATE` | 1.5 | L/s | Vazao minima para qualquer trecho |
| `PIPE_DIAMETERS` | [100..1000] | mm | Diâmetros nominais disponiveis |
| `MIN_DIAMETER_COLLECTOR` | 150 | mm | DN minimo para coletor |
| `MIN_DIAMETER_LATERAL` | 100 | mm | DN minimo para ramal |
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
| `MAX_GRAVITY_DEPTH` | 4.5 | m | 7 | Profundidade maxima antes de considerar bombeamento |
| `PUMP_PENALTY` | 100000 | R$ | 6 | Penalidade de custo para desencorajar bombeamento |
| `REUSE_BONUS` | 0.5 | -- | 6 | Multiplicador de desconto para reutilizacao de aresta |

Constantes economicas (Python):

| Constante | Valor | Significado |
|-----------|-------|-------------|
| `PIPE_UNIT_COST` | 1.0 | Custo unitario de tubulacao (R$/m normalizado) |
| `EXCAVATION_A_COEF` | 1.0 | Coeficiente quadratico de escavacao |
| `EXCAVATION_B_COEF` | 0.5 | Coeficiente linear de escavacao |
| `SLOPE_PENALTY` | 10.0 | Penalidade para declividade insuficiente |
| `PUMP_CAPEX_MIN` | 150000 | Custo minimo de implantacao de elevatoria (R$) |
| `PUMP_CAPEX_MAX` | 500000 | Custo maximo de implantacao de elevatoria (R$) |
| `PUMP_HORIZON_YEARS` | 20 | Horizonte de projeto para VPL |
| `PUMP_DISCOUNT_RATE` | 0.10 | Taxa de desconto para VPL (10%) |

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
