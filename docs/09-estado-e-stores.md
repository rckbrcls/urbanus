# 09 -- Gestao de Estado (Frontend)

## Visao Geral

O frontend usa Zustand como biblioteca de estado reativo, com middleware Immer para atualizacoes imutaveis. Cada aspecto do sistema tem seu store dedicado:

```
graphStore              Nos, arestas, selecao, modo de edicao
commandManager          Pilhas de undo/redo (Command Pattern)
useMapStore             Posicao e zoom do mapa (persistido)
useProjectStore         CRUD de projetos (TanStack Query)
areaSelectionStore      Selecao de bbox e pipeline de processamento
```

## graphStore

**Arquivo**: `stores/graphStore.ts`
**Middleware**: `immer` + `devtools` + `subscribeWithSelector`

### Estado

```typescript
interface GraphState {
  nodes: Record<string, NetworkNode>;      // Indice por ID
  edges: Record<string, NetworkEdge>;      // Indice por ID
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  hoveredFeatureId: string | null;
  editingMode: EditingMode;
}
```

`EditingMode` e um dos valores: `'select' | 'move' | 'add-node' | 'add-edge' | 'delete' | 'split-edge'`.

### Acoes

```typescript
// Manipulacao de nos
addNode(node: NetworkNode): void;
moveNode(id: string, coords: [lng, lat, elev]): void;
removeNode(id: string): void;
setNode(id: string, node: NetworkNode): void;
updateNodeEdgeIds(nodeId: string, edgeIds: string[]): void;

// Manipulacao de arestas
addEdge(edge: NetworkEdge): void;
removeEdge(id: string): void;

// Selecao
setSelection(nodeIds: string[], edgeIds?: string[]): void;
clearSelection(): void;
setHover(featureId: string | null): void;

// Modo
setMode(mode: EditingMode): void;

// Grafo completo
loadGraph(graph: NetworkGraph): void;
reset(): void;
getGraph(): NetworkGraph;
```

### Decisoes de Design

**Record por ID em vez de Array**: acesso O(1) por ID, essencial para atualizacoes frequentes durante drag. Arrays exigiriam `find()` a cada frame.

**Immer**: permite "mutacao" direta no draft (`state.nodes[id].coordinates = newCoords`) que e transformada em atualizacao imutavel. Elimina spread operators aninhados.

**subscribeWithSelector**: permite que componentes se inscrevam em fatias especificas do estado. `GraphLayers` se inscreve apenas em `nodes` e `edges`, nao redesenha quando `selectedNodeIds` muda.

## commandManager

**Arquivo**: `stores/commandManager.ts`

### Command Pattern

Cada edicao do grafo e encapsulada em um comando reversivel:

```typescript
interface GraphCommand {
  execute(): void;
  undo(): void;
  readonly description: string;
}
```

### Implementacoes

| Comando | execute() | undo() |
|---------|-----------|--------|
| `AddNodeCommand` | addNode(node) | removeNode(id) |
| `RemoveNodeCommand` | removeNode(id) + arestas | addNode(node) + arestas |
| `MoveNodeCommand` | moveNode(id, newCoords) | moveNode(id, oldCoords) |
| `AddEdgeCommand` | addEdge(edge) + updateNodeEdgeIds | removeEdge(id) + updateNodeEdgeIds |
| `RemoveEdgeCommand` | removeEdge(id) + updateNodeEdgeIds | addEdge(edge) + updateNodeEdgeIds |
| `SplitEdgeCommand` | removeEdge + addNode + addEdge x2 | reverso composto |

### Gerenciador

```typescript
interface CommandManagerState {
  canUndo: boolean;
  canRedo: boolean;
  lastDescription: string | null;
  execute(command: GraphCommand): void;
  undo(): void;
  redo(): void;
  clear(): void;
}
```

Internamente, o `CommandManager` mantem:
- `undoStack`: pilha de comandos executados (max 100)
- `redoStack`: pilha de comandos desfeitos

Ao executar um novo comando, o `redoStack` e limpo (nao e possivel redo apos nova acao).

### Accessor

Os comandos precisam acessar o `graphStore` para executar acoes. O `getStoreAccessor()` retorna um `GraphStoreAccessor` que encapsula as acoes do store, isolando os comandos da implementacao do Zustand.

## useMapStore

**Arquivo**: `stores/useMapStore.ts`
**Middleware**: `persist` (localStorage, chave: `"map-storage"`)

```typescript
interface MapState {
  center: [number, number];       // [lat, lng]
  zoom: number;
  hasInitialized: boolean;
  setMapState(center, zoom): void;
  setInitialized(): void;
}
```

Valores iniciais:
- `center`: `DEFAULT_CENTER` = [-23.5505, -46.6333] (Sao Paulo)
- `zoom`: `DEFAULT_ZOOM` = 13

A persistencia em localStorage garante que o usuario retorne ao mesmo ponto do mapa ao reabrir a pagina.

## useProjectStore

**Arquivo**: `stores/useProjectStore.ts`

Usa TanStack Query (React Query) para gerenciamento de dados do servidor:

```typescript
// Hooks exportados
useProjects(): { data: Project[], isLoading, error }
useProject(id: string): { data: Project, isLoading, error }
useCreateProject(): { mutate(project: Project), isPending }
useDeleteProject(): { mutate(id: string), isPending }
useUpdateProject(): { mutate(project: Project), isPending }
```

Endpoint base: `http://localhost:8000/projects` (hardcoded -- ponto de atencao para refatoracao).

TanStack Query gerencia cache, invalidacao, retry e estados de loading/error automaticamente.

## areaSelectionStore

**Arquivo**: `stores/areaSelectionStore.ts`

### Estado

```typescript
interface AreaSelectionState {
  viewMode: 'explore' | 'cropped';
  pendingBbox: BoundingBox | null;      // Antes da confirmacao
  activeBbox: BoundingBox | null;       // Apos confirmacao
  bboxArea: number;
  stages: {
    streets: ProcessingStage;
    topography: ProcessingStage;
    nodes: ProcessingStage;
  };
  errors: {
    streets?: string;
    topography?: string;
    nodes?: string;
  };
  isProcessing: boolean;
  streetsData: EnrichedFeatureCollection | null;
  streetCount: number;
  nodes: MapNode[];
  showSaveDialog: boolean;
  validationError: string | null;
}

type ProcessingStage = 'pending' | 'loading' | 'success' | 'error' | 'skipped';
```

### Pipeline de Processamento

`startProcessing()` orquestra 3 estagios sequenciais:

```
1. StreetsService.fetchStreets(bbox)
   |  pending -> loading -> success/error
   v
2. ElevationService.fetchEnrichedGeoJSON(geojson, bbox, "COP30")
   |  pending -> loading -> success/error
   v
3. NodesApiService.extractNodes(enrichedGeojson, "intersections")
   |  pending -> loading -> success/error
   v
   Resultado: nodes[], streetsData, streetCount
```

Se o estagio de topografia falha, ele e marcado como `skipped` e o pipeline continua com os dados de rua sem elevacao. Os nos ainda sao extraidos, mas sem classificacao de extremos.

### Acoes Principais

```typescript
setPendingBbox(bbox: BoundingBox): void;  // Shift+drag concluido
confirmBbox(): void;                       // Cortar para area
cancelBbox(): void;                        // Voltar para explore
clearBbox(): void;                         // Limpar tudo
startProcessing(): Promise<void>;          // Iniciar 3 estagios
```

## Fluxo de Dados

```
User Click
    |
    v
useGraphEditor (interpreta modo + target)
    |
    v
GraphCommand.execute()
    |
    v
graphStore (Zustand + Immer)
    |
    v
useDerivedGeoJSON (converte nodes/edges -> GeoJSON)
    |
    v
MapLibre (source.setData(geojson))
    |
    v
GPU render (WebGL)
```

### Performance

- **Seletores granulares**: componentes usam `useGraphStore(state => state.nodes)` em vez de `useGraphStore()`, evitando re-renders desnecessarios
- **`updateData()` vs `setData()`**: MapLibre pode fazer diff incremental com `updateData()` em vez de substituir todo o source
- **Feature-state**: hover e selecao usam `map.setFeatureState()` que atualiza apenas o estilo sem recriar a geometria
- **Immer patches**: apenas os campos modificados geram novos objetos, preservando identidade referencial para o resto
