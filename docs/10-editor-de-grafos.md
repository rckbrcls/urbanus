# 10 -- Editor de Grafos Interativo

## Modelo de Dados

O editor opera sobre tres tipos definidos em `types/map.ts`:

### NetworkNode

```typescript
interface NetworkNode {
  id: string;
  coordinates: [lng, lat, elevation];    // elevation pode ser NaN
  properties: {
    nodeType?: string;                   // ROSA, VERDE, VERMELHO, etc.
    classification?: string;
    elevation: number | null;
    invertElevation?: number | null;     // cota de fundo do tubo
    rimElevation?: number | null;        // cota da tampa do PV
    depth?: number | null;               // profundidade
    degree: number;                      // conectividade
    edgeIds: string[];                   // IDs das arestas conectadas
    streetId?: string;
    streetName?: string;
    highway?: string;
    vertexIndex?: number;
    isEndpoint?: boolean;
    isIntersection?: boolean;
    isHighestElevation?: boolean;
    isLowestElevation?: boolean;
    connectedStreets?: string[];
  };
}
```

### NetworkEdge

```typescript
interface NetworkEdge {
  id: string;
  sourceId: string;
  targetId: string;
  geometry: [lng, lat][];               // pontos intermediarios
  properties: {
    length: number;                     // metros
    slope: number | null;               // m/m
    material?: string;
    manningN?: number;
    flowDirection?: 'downstream' | 'upstream' | 'unknown';
    upstreamOffset?: number;
    downstreamOffset?: number;
    streetId?: string;
    streetName?: string;
    highway?: string;
  };
}
```

### NetworkGraph

```typescript
interface NetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}
```

## useGraphEditor

**Arquivo**: `hooks/useGraphEditor.ts`

Hook orquestrador que gerencia todas as interacoes do mapa com o editor de grafos. Retorna:

```typescript
{
  isDragging: boolean;
  ghostEdgeFrom: [lng, lat] | null;    // origem da aresta fantasma
  ghostEdgeTo: [lng, lat] | null;      // cursor (destino da aresta fantasma)
  handleClick: (e: MapLayerMouseEvent) => void;
  handleMouseDown: (e: MapLayerMouseEvent) => void;
  handleMouseMove: (e: MapLayerMouseEvent) => void;
  handleMouseUp: (e: MapLayerMouseEvent) => void;
}
```

### Fluxo de Eventos

```
MapLibre Event
    |
    v
useGraphEditor (le editingMode do graphStore)
    |
    +-- handleClick
    |     select:     identifica feature, atualiza selecao
    |     add-node:   snap, cria NetworkNode, executa AddNodeCommand
    |     add-edge:   1o click = origem, 2o click = destino + AddEdgeCommand
    |     delete:     identifica feature, executa RemoveNodeCommand/RemoveEdgeCommand
    |     split-edge: identifica aresta, calcula ponto, executa SplitEdgeCommand
    |
    +-- handleMouseDown (move mode)
    |     Identifica no sob cursor, inicia drag
    |
    +-- handleMouseMove
    |     move: atualiza posicao do no + arestas em tempo real
    |     add-edge: atualiza ghostEdgeTo para preview
    |     todos: atualiza feature-state de hover
    |
    +-- handleMouseUp (move mode)
          Commita MoveNodeCommand com old/new coords
```

### Identificacao de Features

O hook usa `map.queryRenderedFeatures(point, { layers: [...] })` para identificar nos e arestas sob o cursor. Isso usa a GPU (WebGL picking) e e extremamente rapido, sem necessidade de R-tree ou busca em array.

### Feature-State para Feedback Visual

Em vez de modificar o GeoJSON source, o hook usa `map.setFeatureState()` para ativar/desativar estados visuais:

```typescript
// Hover
map.setFeatureState(
  { source: 'nodes-source', id: featureId },
  { hovered: true }
);

// Selecao
map.setFeatureState(
  { source: 'nodes-source', id: featureId },
  { selected: true }
);
```

Isso requer `promoteId: "id"` no source, que permite ao MapLibre associar feature-states por ID string (em vez de indice numerico).

Vantagem: a GPU redesenha apenas o estilo (cor, raio) sem reprocessar a geometria. Hover e selecao sao instantaneos mesmo com milhares de features. O raio dos nós e composto com expressoes dependentes de `zoom`, entao o destaque visual continua funcionando enquanto o tamanho base encolhe ao afastar o mapa e cresce de forma limitada ao aproximar.

## Drag de Nos

### Fluxo

1. **mousedown** (mode = move): identifica no sob cursor, salva `oldCoords`
2. **mousemove**: atualiza `node.coordinates` no store + recalcula arestas conectadas
3. **mouseup**: cria `MoveNodeCommand(id, oldCoords, newCoords)` e executa via `commandManager`

### Atualizacao de Arestas em Tempo Real

Quando um no e arrastado, todas as arestas conectadas (via `node.properties.edgeIds`) sao atualizadas:
- Se o no e `sourceId` da aresta: atualiza o primeiro ponto da geometria
- Se o no e `targetId` da aresta: atualiza o ultimo ponto da geometria

Isso garante que as linhas "seguem" o no durante o drag.

## Snapping Inteligente

**Arquivo**: `lib/map/snapping.ts`

O snap aproxima o cursor de pontos relevantes durante `add-node` e `add-edge`.

### Prioridades

1. **Nos existentes** (maior prioridade): usa `map.queryRenderedFeatures()` com raio de 12px na camada de nos
2. **Geometria de ruas**: usa `turf.nearestPointOnLine()` para encontrar o ponto mais proximo em qualquer LineString visivel

### Raio de Snap

12 pixels, convertido para metros baseado no zoom atual. Em zoom 15, ~12px equivale a ~5 metros.

### Resultado

Se o snap e ativado, o no e criado exatamente na posicao do no/rua mais proximo, em vez da posicao do click. Isso garante conectividade topologica correta.

## Command Pattern

### Estrutura

```typescript
interface GraphCommand {
  execute(): void;
  undo(): void;
  readonly description: string;
}
```

Cada comando captura o estado necessario para desfazer a acao:

### AddNodeCommand

```typescript
class AddNodeCommand implements GraphCommand {
  constructor(private node: NetworkNode, private accessor: GraphStoreAccessor) {}

  execute() { this.accessor.addNode(this.node); }
  undo()    { this.accessor.removeNode(this.node.id); }
  description = `Adicionar no ${this.node.id}`;
}
```

### RemoveNodeCommand

Captura o no E todas as arestas conectadas para restaurar na operacao de undo:

```typescript
class RemoveNodeCommand implements GraphCommand {
  private removedEdges: NetworkEdge[];

  execute() {
    this.removedEdges = this.accessor.getEdgesForNode(this.node.id);
    for (const edge of this.removedEdges) {
      this.accessor.removeEdge(edge.id);
    }
    this.accessor.removeNode(this.node.id);
  }

  undo() {
    this.accessor.addNode(this.node);
    for (const edge of this.removedEdges) {
      this.accessor.addEdge(edge);
    }
  }
}
```

### MoveNodeCommand

```typescript
class MoveNodeCommand implements GraphCommand {
  constructor(
    private nodeId: string,
    private oldCoords: [number, number, number],
    private newCoords: [number, number, number],
    private accessor: GraphStoreAccessor
  ) {}

  execute() { this.accessor.moveNode(this.nodeId, this.newCoords); }
  undo()    { this.accessor.moveNode(this.nodeId, this.oldCoords); }
}
```

### SplitEdgeCommand

Comando composto:

```typescript
class SplitEdgeCommand implements GraphCommand {
  execute() {
    this.accessor.removeEdge(this.originalEdge.id);
    this.accessor.addNode(this.newNode);
    this.accessor.addEdge(this.edge1);  // source -> newNode
    this.accessor.addEdge(this.edge2);  // newNode -> target
  }

  undo() {
    this.accessor.removeEdge(this.edge2.id);
    this.accessor.removeEdge(this.edge1.id);
    this.accessor.removeNode(this.newNode.id);
    this.accessor.addEdge(this.originalEdge);
  }
}
```

### Atalhos de Teclado

| Atalho | Acao |
|--------|------|
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z | Redo |
| Escape | Cancelar add-edge em andamento |
| V, M, A, E, D, S | Trocar modo de edicao |

Os atalhos sao registrados no `useGraphEditor` via event listener de `keydown` no document.

## Serializacao

### MapNode -> NetworkGraph

A funcao `mapNodesToNetworkGraph()` converte os nos extraidos da API (`MapNode[]`) para o modelo do editor (`NetworkGraph`):

```
MapNode (API response)          NetworkNode (editor)
  id                     ->       id
  position.lat/lng       ->       coordinates: [lng, lat, elevation]
  elevation              ->       coordinates[2]
  nodeType               ->       properties.nodeType
  degree                 ->       properties.degree
  connectedStreets       ->       properties.connectedStreets
  ...                              ...
```

Arestas sao criadas a partir da topologia do grafo viario (nos conectados pela mesma rua).

### NetworkGraph -> GeoJSON

O hook `useDerivedGeoJSON` converte o estado do store para GeoJSON FeatureCollections:

```
NetworkNode -> GeoJSON Point Feature
  coordinates -> geometry.coordinates
  properties  -> feature.properties (achatado)

NetworkEdge -> GeoJSON LineString Feature
  sourceId + targetId + geometry -> geometry.coordinates
  properties -> feature.properties (achatado)
```

Essas FeatureCollections alimentam os sources do MapLibre para renderizacao.
Os layers de nós usam expressoes de raio interpoladas por zoom, compartilhadas
entre editor, preview e visualizacao processada, para manter a escala visual
consistente em diferentes distancias de camera.
