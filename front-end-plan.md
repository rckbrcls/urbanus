# Edição de grafos geoespaciais com MapLibre GL JS no URBANUS

**A migração de Leaflet para MapLibre GL JS + react-map-gl permite construir um editor de grafos de rede de esgoto com performance WebGL, drag-and-drop de nós, atualização em tempo real de arestas e undo/redo completo — tudo integrado nativamente ao ecossistema Next.js 16 + React 19 + Zustand.** A chave está em uma arquitetura custom que usa `Source`/`Layer` para renderização GPU-accelerated, `feature-state` para feedback visual instantâneo, e um Command Pattern para operações atômicas sobre o grafo. Este relatório detalha cada camada da implementação, desde a configuração do projeto até os algoritmos de snapping e validação topológica.

---

## Stack tecnológica e versões compatíveis

As versões atuais (março 2026) e os padrões de importação corretos são fundamentais para evitar problemas de compatibilidade. O **maplibre-gl v5.20.x** é a release estável mais recente, com suporte a terreno 3D, globe projection e o método crucial `updateData()` para atualizações parciais de GeoJSON. O **react-map-gl v8.1.0** oferece um endpoint dedicado `/maplibre` que elimina qualquer dependência do mapbox-gl.

A instalação recomendada:

```bash
npm install react-map-gl maplibre-gl
# OU o pacote dedicado:
npm install @vis.gl/react-maplibre maplibre-gl
```

O import correto para MapLibre, que fornece tipos nativos sem necessidade de pacotes placeholder:

```tsx
import Map, { Source, Layer, Marker, Popup, useMap, useControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
```

**Sobre bibliotecas de desenho**: o nebula.gl está **oficialmente descontinuado** e não aceita mais contribuições externas. O react-map-gl-draw igualmente. O sucessor `@deck.gl-community/editable-layers` tem manutenção limitada. Para desenho genérico, o **Terra Draw** (v1.26.0, projeto OSGeo, MIT) com o adaptador `terra-draw-maplibre-gl-adapter` é a alternativa mais ativa — notavelmente, seu desenvolvedor principal trabalha com GIS de redes de água e esgoto. Porém, para edição de grafos com semântica de nós/arestas, **a recomendação é implementação custom** usando Source/Layer/eventos nativos do MapLibre, que dá controle total sobre relações topológicas.

---

## Integração com Next.js 16 App Router e React 19

O MapLibre GL JS depende do DOM e WebGL, que não existem no servidor. No App Router do Next.js 16, **todos os componentes são Server Components por padrão**, então a integração exige uma estratégia específica de boundary client/server.

O padrão obrigatório é criar um wrapper `'use client'` que faz dynamic import com `ssr: false`:

```tsx
// components/map/MapWrapper.tsx
'use client';
import dynamic from 'next/dynamic';

const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-gray-100 animate-pulse">
      <p>Carregando mapa...</p>
    </div>
  ),
});

export default function MapWrapper() {
  return <MapView />;
}
```

```tsx
// app/mapa/page.tsx (Server Component)
import MapWrapper from '@/components/map/MapWrapper';

export default function MapPage() {
  return (
    <div className="h-screen w-full">
      <MapWrapper />
    </div>
  );
}
```

**Alerta crítico sobre Turbopack**: existe um bug documentado (GitHub issue #86495) onde o Turbopack do Next.js 16 descarta o Web Worker inline do MapLibre, causando tiles que nunca renderizam. O workaround é desabilitar o Turbopack durante desenvolvimento (`next dev` sem `--turbo`) ou usar `TURBOPACK=0 next dev`.

O **React Compiler** (estável no Next.js 16, habilitado via `reactCompiler: true` no `next.config.ts`) faz memoização automática de componentes, o que beneficia enormemente a UI do mapa ao reduzir re-renders desnecessários. Duas features do React 19.2 são particularmente úteis: **`useEffectEvent()`** permite extrair lógica de event handlers dos Effects sem adicionar dependências (ideal para callbacks do mapa que acessam estado mutável), e **`<Activity />`** pode manter o estado do mapa vivo quando o usuário navega temporariamente para outra rota.

Para CSS, o MapLibre usa o namespace `.maplibregl-*` que coexiste com TailwindCSS sem conflitos. Importe `maplibre-gl/dist/maplibre-gl.css` diretamente no componente client ou no layout raiz. Se os controles do MapLibre ficarem distorcidos pelo CSS reset do Tailwind (Preflight), adicione no `globals.css`:

```css
.maplibregl-map * { box-sizing: content-box; }
```

---

## Modelo de dados do grafo e arquitetura do estado com Zustand

A arquitetura mais eficiente para o URBANUS mantém o **grafo como fonte autoritativa** em estruturas de adjacência TypeScript, derivando FeatureCollections GeoJSON apenas para renderização. Isso separa a lógica topológica (quais nós conectam a quais arestas) da representação visual.

O modelo de dados segue as convenções do EPA SWMM para compatibilidade de exportação:

```typescript
interface NetworkNode {
  id: string;
  coordinates: [number, number, number]; // [lng, lat, elevação]
  properties: {
    nodeType: 'fixed' | 'candidate' | 'created';
    classification: 'PV'; // Poço de Visita
    elevation: number;       // elevação do terreno (m)
    invertElevation: number; // cota do fundo do PV
    rimElevation: number;    // cota da tampa
    depth: number;           // profundidade (m)
    degree: number;          // grau topológico
    edgeIds: string[];       // adjacência
  };
}

interface NetworkEdge {
  id: string;
  sourceId: string;
  targetId: string;
  geometry: number[][];  // coordenadas LineString
  properties: {
    length: number;          // metros
    slope: number;           // negativo = descida na direção do fluxo
    diameter: number;        // mm
    material: string;
    manningN: number;
    flowDirection: 'gravity' | 'pressurized';
    upstreamOffset: number;  // offset SWMM
    downstreamOffset: number;
  };
}

interface NetworkGraph {
  nodes: Map<string, NetworkNode>;
  edges: Map<string, NetworkEdge>;
  adjacency: Map<string, Set<string>>;  // nodeId → edgeIds
  outgoing: Map<string, Set<string>>;   // nodeId → outgoing edgeIds
  incoming: Map<string, Set<string>>;   // nodeId → incoming edgeIds
}
```

A **store Zustand** deve ser dividida em domínios separados para evitar que atualizações de alta frequência (viewport durante pan/zoom) causem re-renders em componentes de dados. A configuração usa o middleware stack `devtools > subscribeWithSelector > immer`:

```typescript
// stores/graphStore.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { devtools, subscribeWithSelector } from 'zustand/middleware';

interface GraphState {
  nodes: Record<string, NetworkNode>;
  edges: Record<string, NetworkEdge>;
  selectedNodeIds: Set<string>;
  selectedEdgeIds: Set<string>;
  hoveredFeatureId: string | null;
  editingMode: 'select' | 'add-node' | 'add-edge' | 'move' | 'delete' | 'split-edge';
}

export const useGraphStore = create<GraphState & GraphActions>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        nodes: {},
        edges: {},
        selectedNodeIds: new Set(),
        selectedEdgeIds: new Set(),
        hoveredFeatureId: null,
        editingMode: 'select',

        addNode: (node) => set((s) => { s.nodes[node.id] = node; }),

        moveNode: (id, newCoords) => set((s) => {
          s.nodes[id].coordinates = newCoords;
          // Atualizar geometria de todas as arestas conectadas
          for (const edge of Object.values(s.edges)) {
            if (edge.sourceId === id) {
              edge.geometry[0] = newCoords;
            }
            if (edge.targetId === id) {
              edge.geometry[edge.geometry.length - 1] = newCoords;
            }
          }
        }),

        removeNode: (id) => set((s) => {
          delete s.nodes[id];
          s.selectedNodeIds.delete(id);
          // Cascade: remover arestas conectadas
          for (const [edgeId, edge] of Object.entries(s.edges)) {
            if (edge.sourceId === id || edge.targetId === id) {
              delete s.edges[edgeId];
            }
          }
        }),
        // ... demais actions
      }))
    ),
    { name: 'GraphStore' }
  )
);
```

**Regra essencial de performance**: nunca desestruture a store inteira. Use seletores granulares:

```tsx
// ✅ Correto: só re-renderiza quando editingMode muda
const editingMode = useGraphStore((s) => s.editingMode);

// ✅ Para múltiplos valores, use useShallow
import { useShallow } from 'zustand/react/shallow';
const { nodes, edges } = useGraphStore(
  useShallow((s) => ({ nodes: s.nodes, edges: s.edges }))
);
```

Para atualizações de **alta frequência durante drag** de nós, use a API nativa do MapLibre via ref em vez de passar pelo ciclo de reconciliação do React:

```tsx
const onDragMove = useCallback((e: MapMouseEvent) => {
  const map = mapRef.current.getMap();
  const source = map.getSource('nodes') as maplibregl.GeoJSONSource;
  source.updateData({ type: 'FeatureCollection', features: [updatedFeature] });
}, []);
```

O método `updateData()` (disponível desde MapLibre v4) é **significativamente mais eficiente** que `setData()` para atualizações parciais — evita o `JSON.stringify` + retiling completo que pode bloquear ~200ms para datasets grandes.

---

## Implementação do editor de grafos interativo

O coração do sistema é a renderização dos nós e arestas como camadas MapLibre GL com interatividade custom. A abordagem usa **duas Sources GeoJSON** (nós como `circle`, arestas como `line`) com `feature-state` para feedback visual e handlers de mouse para drag/click.

### Renderização com feedback visual via feature-state

```tsx
function GraphMapView() {
  const mapRef = useRef(null);
  const { nodes, edges, editingMode } = useGraphStore(
    useShallow((s) => ({ nodes: s.nodes, edges: s.edges, editingMode: s.editingMode }))
  );

  // Derivar GeoJSON das stores (memoizado)
  const nodesGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: Object.values(nodes).map((n) => ({
      type: 'Feature' as const,
      id: n.id,
      geometry: { type: 'Point' as const, coordinates: n.coordinates },
      properties: { ...n.properties, id: n.id },
    })),
  }), [nodes]);

  const edgesGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: Object.values(edges).map((e) => ({
      type: 'Feature' as const,
      id: e.id,
      geometry: { type: 'LineString' as const, coordinates: e.geometry },
      properties: { ...e.properties, id: e.id, sourceNodeId: e.sourceId, targetNodeId: e.targetId },
    })),
  }), [edges]);

  return (
    <Map
      ref={mapRef}
      initialViewState={{ longitude: -43.17, latitude: -22.90, zoom: 14 }}
      mapStyle="https://tiles.openfreemap.org/styles/liberty"
      interactiveLayerIds={['nodes-layer', 'edges-layer']}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      cursor={cursorForMode(editingMode)}
    >
      <Source id="edges-src" type="geojson" data={edgesGeoJSON} promoteId="id">
        <Layer id="edges-layer" type="line" paint={{
          'line-color': ['case',
            ['boolean', ['feature-state', 'selected'], false], '#ff6600',
            ['boolean', ['feature-state', 'hover'], false], '#0088ff',
            ['boolean', ['feature-state', 'error'], false], '#ff0000',
            '#666666'
          ],
          'line-width': ['case',
            ['boolean', ['feature-state', 'selected'], false], 4, 2
          ],
        }} />
        {/* Setas de direção de fluxo */}
        <Layer id="edges-arrows" type="symbol" layout={{
          'symbol-placement': 'line',
          'symbol-spacing': 80,
          'icon-image': 'arrow-icon',
          'icon-size': 0.6,
          'icon-rotation-alignment': 'map',
        }} />
      </Source>

      <Source id="nodes-src" type="geojson" data={nodesGeoJSON} promoteId="id">
        <Layer id="nodes-layer" type="circle" paint={{
          'circle-radius': ['case',
            ['boolean', ['feature-state', 'selected'], false], 10,
            ['boolean', ['feature-state', 'hover'], false], 8, 6
          ],
          'circle-color': ['match', ['get', 'nodeType'],
            'fixed', '#e74c3c',
            'candidate', '#f39c12',
            'created', '#2ecc71',
            '#3498db'
          ],
          'circle-stroke-width': ['case',
            ['boolean', ['feature-state', 'selected'], false], 3, 1.5
          ],
          'circle-stroke-color': '#ffffff',
        }} />
      </Source>

      {/* Ghost edge durante modo add-edge */}
      <Source id="ghost-edge" type="geojson" data={ghostEdgeGeoJSON}>
        <Layer id="ghost-edge-line" type="line" paint={{
          'line-color': '#999', 'line-dasharray': [2, 2], 'line-width': 2
        }} />
      </Source>
    </Map>
  );
}
```

A propriedade `promoteId="id"` nas Sources é **obrigatória** para que `setFeatureState()` funcione — ela mapeia uma propriedade do GeoJSON como identificador de feature. A prop `interactiveLayerIds` deve listar todas as layers que devem retornar features nos eventos `onClick`/`onMouseMove`.

### Drag de nós com atualização de arestas em tempo real

A implementação de drag usa eventos nativos do mouse, desabilitando o pan do mapa durante a operação:

```typescript
const [dragging, setDragging] = useState<{ nodeId: string; startCoords: number[] } | null>(null);

const handleMouseDown = useCallback((e: MapLayerMouseEvent) => {
  if (editingMode !== 'move' || !e.features?.length) return;
  const feature = e.features[0];
  if (feature.layer.id !== 'nodes-layer') return;
  
  e.preventDefault(); // Impede pan do mapa
  setDragging({
    nodeId: feature.properties.id,
    startCoords: [...nodes[feature.properties.id].coordinates],
  });
}, [editingMode, nodes]);

const handleMouseMove = useCallback((e: MapMouseEvent) => {
  if (!dragging) {
    // Hover logic: setFeatureState para highlight
    handleHover(e);
    return;
  }
  // Atualizar posição via API nativa (sem React reconciliation)
  const map = mapRef.current.getMap();
  const newCoords = [e.lngLat.lng, e.lngLat.lat, nodes[dragging.nodeId].coordinates[2]];
  
  // updateData para nó + arestas conectadas
  const updatedFeatures = buildUpdatedFeatures(dragging.nodeId, newCoords, nodes, edges);
  map.getSource('nodes-src').updateData({
    type: 'FeatureCollection', features: [updatedFeatures.node]
  });
  map.getSource('edges-src').updateData({
    type: 'FeatureCollection', features: updatedFeatures.edges
  });
}, [dragging, nodes, edges]);

const handleMouseUp = useCallback(() => {
  if (!dragging) return;
  const newCoords = /* posição final */;
  // Commit via Command Pattern (permite undo)
  commandManager.execute(new MoveNodeCommand(
    dragging.nodeId, dragging.startCoords, newCoords
  ));
  setDragging(null);
}, [dragging]);
```

O `dragPan` do componente `<Map>` deve ser desabilitado condicionalmente durante o drag: `dragPan={!dragging}`.

### Snapping inteligente com turf.js e queryRenderedFeatures

O snapping usa duas estratégias complementares — **GPU-accelerated hit detection** via `queryRenderedFeatures` para nós próximos, e **turf.js `nearestPointOnLine`** para snap à geometria de ruas:

```typescript
import * as turf from '@turf/turf';

function snapToNearest(
  lngLat: { lng: number; lat: number },
  map: maplibregl.Map,
  streetFeatures: GeoJSON.FeatureCollection,
  snapRadiusPx: number = 15
): SnapResult {
  const point = map.project([lngLat.lng, lngLat.lat]);
  
  // 1. Prioridade: snap a nós existentes (via GPU query)
  const nearbyNodes = map.queryRenderedFeatures(
    [[point.x - snapRadiusPx, point.y - snapRadiusPx],
     [point.x + snapRadiusPx, point.y + snapRadiusPx]],
    { layers: ['nodes-layer'] }
  );
  if (nearbyNodes.length > 0) {
    const coords = (nearbyNodes[0].geometry as GeoJSON.Point).coordinates;
    return { type: 'node', nodeId: nearbyNodes[0].properties.id, coordinates: coords };
  }

  // 2. Snap a geometria de ruas (turf.js)
  const turfPoint = turf.point([lngLat.lng, lngLat.lat]);
  let minDist = Infinity;
  let bestSnap = null;
  
  for (const street of streetFeatures.features) {
    const nearest = turf.nearestPointOnLine(street as any, turfPoint);
    if (nearest.properties.dist < minDist) {
      minDist = nearest.properties.dist;
      bestSnap = nearest.geometry.coordinates;
    }
  }
  
  // Converter threshold de pixels para metros no zoom atual
  const thresholdMeters = snapRadiusPx * getMetersPerPixel(map);
  if (bestSnap && minDist * 1000 < thresholdMeters) {
    return { type: 'street', coordinates: bestSnap };
  }

  return { type: 'none', coordinates: [lngLat.lng, lngLat.lat] };
}
```

### Undo/Redo com Command Pattern

Cada operação de edição é encapsulada em um Command que sabe executar e desfazer a si mesmo:

```typescript
interface GraphCommand {
  execute(): void;
  undo(): void;
  description: string;
}

class CommandManager {
  private undoStack: GraphCommand[] = [];
  private redoStack: GraphCommand[] = [];

  execute(command: GraphCommand) {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = []; // Limpar redo em nova ação
  }

  undo() {
    const cmd = this.undoStack.pop();
    if (cmd) { cmd.undo(); this.redoStack.push(cmd); }
  }

  redo() {
    const cmd = this.redoStack.pop();
    if (cmd) { cmd.execute(); this.undoStack.push(cmd); }
  }
}

// Operação de split de aresta: CompoundCommand atômico
class SplitEdgeCommand implements GraphCommand {
  private commands: GraphCommand[];
  
  constructor(graph: NetworkGraph, edgeId: string, splitPoint: number[]) {
    const edge = graph.edges.get(edgeId);
    const newNode = createNode(splitPoint);
    const [geom1, geom2] = turf.lineSplit(
      turf.lineString(edge.geometry), turf.point(splitPoint)
    );
    
    this.commands = [
      new RemoveEdgeCommand(graph, edge),
      new AddNodeCommand(graph, newNode),
      new AddEdgeCommand(graph, createEdge(edge.sourceId, newNode.id, geom1)),
      new AddEdgeCommand(graph, createEdge(newNode.id, edge.targetId, geom2)),
    ];
  }
  
  execute() { this.commands.forEach((c) => c.execute()); }
  undo() { [...this.commands].reverse().forEach((c) => c.undo()); }
  description = 'Dividir aresta';
}
```

**Regra para drag**: durante o `mousemove` não se cria comandos — apenas na conclusão do drag (`mouseup`) é que um único `MoveNodeCommand` é registrado, capturando posição inicial e final.

---

## Cálculos específicos de rede de esgoto

O modelo de rede segue as convenções do EPA SWMM, onde a **declividade** determina se o fluxo é gravitacional ou requer bombeamento:

```typescript
function calculateSlope(source: NetworkNode, target: NetworkNode, length: number): number {
  // Convenção SWMM: positivo = descida (fluxo gravitacional)
  return (source.properties.invertElevation - target.properties.invertElevation) / length;
}

function validateSlope(slope: number, diameter: number): ValidationResult {
  const minSlope = diameter <= 200 ? 0.005 : 0.003; // simplificado
  if (slope < 0) return { valid: false, severity: 'error', message: 'Declividade adversa — requer bombeamento' };
  if (slope < minSlope) return { valid: false, severity: 'warning', message: 'Abaixo do mínimo para autolimpeza' };
  return { valid: true };
}
```

A **direção de fluxo** é representada pela orientação da aresta (`sourceId` → `targetId` = direção do fluxo) e visualizada com setas via `symbol` layer com `symbol-placement: 'line'`. Quando a elevação muda a suposição de fluxo, arestas podem precisar ser invertidas. A **validação de conectividade** garante que todos os nós sejam alcançáveis a partir dos exutórios (nós sem arestas de saída) via BFS reverso:

```typescript
function findOrphanNodes(graph: NetworkGraph): string[] {
  const outfalls = [...graph.nodes.keys()].filter(
    (id) => (graph.outgoing.get(id)?.size || 0) === 0
  );
  const reachable = new Set<string>();
  for (const outfall of outfalls) {
    traverseUpstream(graph, outfall).forEach((id) => reachable.add(id));
  }
  return [...graph.nodes.keys()].filter((id) => !reachable.has(id));
}
```

Para análise de rede mais complexa (caminhos mais curtos, componentes conectados, árvore geradora), a biblioteca **graphology** oferece algoritmos prontos. Para indexação espacial eficiente durante snapping com milhares de nós, **rbush** (R-tree) permite queries de bounding box em O(log n).

---

## Estrutura de projeto recomendada e mapa base

A organização de arquivos separa claramente a boundary server/client:

```
urbanus-frontend/
├── app/
│   ├── layout.tsx              # Root layout (import globals.css)
│   ├── mapa/
│   │   ├── page.tsx            # Server Component → importa MapWrapper
│   │   └── loading.tsx         # Skeleton durante carregamento
│   └── globals.css             # @tailwind + override maplibre se necessário
├── components/
│   ├── map/
│   │   ├── MapWrapper.tsx      # 'use client' + dynamic(ssr:false)
│   │   ├── GraphMapView.tsx    # Componente principal do mapa
│   │   ├── GraphLayers.tsx     # Source/Layer para nós e arestas
│   │   └── GhostEdge.tsx       # Preview durante add-edge
│   ├── panels/
│   │   ├── Toolbar.tsx         # Seleção de modo (select/add/delete)
│   │   └── PropertyPanel.tsx   # Edição de propriedades do nó/aresta selecionado
│   └── ui/
├── stores/
│   ├── graphStore.ts           # Nós, arestas, seleção, modo de edição
│   ├── mapStore.ts             # Viewport (separado para evitar re-renders)
│   └── commandManager.ts       # Undo/redo
├── lib/
│   ├── graph/
│   │   ├── types.ts            # NetworkNode, NetworkEdge, NetworkGraph
│   │   ├── operations.ts       # moveNode, splitEdge, validateConnectivity
│   │   ├── commands.ts         # AddNodeCommand, MoveNodeCommand, etc.
│   │   └── serialization.ts    # Graph ↔ GeoJSON ↔ SWMM .inp
│   └── map/
│       ├── layers.ts           # Definições de style para circle/line layers
│       ├── snapping.ts         # Lógica de snap (turf.js + queryRenderedFeatures)
│       └── styles.ts           # URLs de map styles
├── hooks/
│   ├── useGraphEditor.ts       # Hook que orquestra modo + eventos + commands
│   └── useDerivedGeoJSON.ts    # Memoiza conversão graph → GeoJSON
└── next.config.ts
```

Para **mapa base gratuito**, o **OpenFreeMap** (`https://tiles.openfreemap.org/styles/liberty`) é a opção mais simples: sem API key, sem limites de uso, estilos `liberty`, `positron` e `bright` disponíveis. Alternativas incluem MapTiler (100K tile loads/mês gratuitos, requer key) e CartoCDN (`https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json`, sem key). Para self-hosting, **Martin** (Rust, gera tiles de PostGIS on-the-fly) ou **Protomaps** (PMTiles em S3/R2) eliminam dependência de serviços externos.

A configuração `next.config.ts` para o projeto:

```typescript
const nextConfig = {
  reactCompiler: true, // Auto-memoização do React Compiler
  webpack: (config) => {
    // Alias para compatibilidade de plugins legados
    config.resolve.alias['mapbox-gl'] = 'maplibre-gl';
    return config;
  },
};
export default nextConfig;
```

---

## Conclusão

A arquitetura proposta inverte a dependência típica: **o grafo é a fonte de verdade** (adjacency maps em TypeScript/Zustand), e o GeoJSON é um artefato derivado para renderização. Isso resolve o problema fundamental do GeoJSON — ausência de topologia nativa — sem sacrificar a performance WebGL do MapLibre. Três decisões arquiteturais são as mais impactantes: usar `updateData()` em vez de `setData()` para drag em tempo real (evita retiling completo), separar stores Zustand por domínio de frequência de atualização (viewport vs. dados do grafo), e implementar CompoundCommands para operações topológicas que envolvem múltiplos passos atômicos (split de aresta = remover aresta + criar nó + criar 2 arestas novas, tudo undoable como uma unidade). A migração de Leaflet elimina o gargalo de performance DOM-based que limita redes com centenas de nós, e a integração nativa com feature-state torna hover/seleção instantâneos sem reprocessamento de dados. O alinhamento do modelo de dados com o EPA SWMM garante que a exportação para ferramentas de simulação hidráulica seja direta.