# 08 -- Frontend Next.js

## Estrutura de Pastas

```
apps/web/
├── app/
│   ├── layout.tsx                    # Layout raiz (Geist font, ThemeProvider, Sidebar)
│   ├── page.tsx                      # Home: mapa de exploracao (dynamic import)
│   ├── api/
│   │   ├── streets/route.ts          # Proxy para Overpass API
│   │   ├── elevation/enrich/route.ts # Proxy para FastAPI (/elevation/enrich)
│   │   ├── topography/route.ts       # Proxy para OpenTopography API
│   │   ├── nodes/extract/route.ts    # Proxy para FastAPI (/nodes/extract)
│   │   └── geo/
│   │       ├── validate-bbox/route.ts # Validacao de bbox
│   │       └── nodes/route.ts         # CRUD de nos (stub)
│   └── projects/
│       ├── page.tsx                   # Lista de projetos
│       └── [id]/
│           ├── page.tsx               # Pagina do editor
│           └── ProjectEditor.tsx      # Editor de grafos completo
│
├── components/
│   ├── map/
│   │   ├── MapWrapper.tsx             # Wrapper client-side (dynamic import)
│   │   ├── MapView.tsx                # Mapa de exploracao (explore/cropped)
│   │   ├── GraphMapView.tsx           # Mapa do editor de grafos
│   │   ├── GraphLayers.tsx            # Camadas de nos (circle) e arestas (line)
│   │   ├── FlowArrows.tsx             # Setas direcionais (symbol layer)
│   │   ├── GhostEdge.tsx              # Linha tracejada preview (add-edge)
│   │   ├── BboxDrawControl.tsx        # Shift+drag para selecao de area
│   │   ├── StreetsLayer.tsx            # Camada de ruas coloridas
│   │   └── PreviewNodesLayer.tsx      # Nos extraidos (preview)
│   ├── panels/
│   │   ├── Toolbar.tsx                # Barra de ferramentas (modos + undo/redo)
│   │   └── PropertyPanel.tsx          # Inspector de no/aresta selecionados
│   ├── ProcessingModal.tsx            # Modal de processamento (3 estagios)
│   └── ui/                            # Componentes shadcn/ui
│
├── features/map/
│   ├── hooks/
│   │   ├── useNodeSelection.ts        # Selecao de nos com hover
│   │   ├── useNodeHistory.ts          # Historico de posicoes para undo
│   │   └── useElevationSync.ts        # Sincronizacao de elevacao
│   ├── services/
│   │   ├── StreetsService.ts           # Busca ruas via Overpass
│   │   ├── ElevationService.ts        # Enriquecimento de elevacao
│   │   ├── NodesApiService.ts         # Extracao de nos via API
│   │   └── BoundingBoxService.ts      # Validacao de bbox
│   └── validators/                    # Validadores de dados
│
├── hooks/
│   ├── useGraphEditor.ts              # Orquestrador de interacoes do mapa
│   └── useDerivedGeoJSON.ts           # Conversao store -> GeoJSON
│
├── stores/
│   ├── graphStore.ts                  # Zustand: nos, arestas, selecao, modo
│   ├── areaSelectionStore.ts          # Zustand: bbox, estagios, dados
│   ├── useMapStore.ts                 # Zustand + persist: viewport
│   ├── useProjectStore.ts             # TanStack Query: CRUD projetos
│   └── commandManager.ts             # Command Pattern: undo/redo
│
├── types/
│   └── map.ts                         # NetworkNode, NetworkEdge, etc.
│
└── lib/
    ├── map/snapping.ts                # Snapping inteligente
    └── utils.ts                       # cn() (clsx + tailwind-merge)
```

## App Router

### Renderizacao do Mapa

O MapLibre GL JS requer acesso ao DOM e WebGL, portanto o mapa e carregado exclusivamente no client:

```typescript
// app/page.tsx
const MapWrapper = dynamic(() => import("@/components/map/MapWrapper"), {
  ssr: false,
  loading: () => <Spinner />,
});
```

Todas as interacoes de mapa (pan, zoom, click, drag) sao tratadas pelo MapLibre, nao por event listeners do React. O React controla apenas o estado (stores) e os dados (GeoJSON sources).

### API Routes

As API routes do Next.js servem como proxies para servicos externos, isolando chaves de API e simplificando CORS:

| Rota | Servico | Descricao |
|------|---------|-----------|
| `POST /api/streets` | Overpass API | Busca malha viaria por bbox |
| `POST /api/elevation/enrich` | FastAPI | Enriquece GeoJSON com elevacao |
| `POST /api/topography` | OpenTopography | Download de GeoTIFF (DEM) |
| `POST /api/nodes/extract` | FastAPI | Extrai e classifica nos |
| `GET/POST /api/projects` | FastAPI | Lista e faz upsert de projetos via proxy same-origin |
| `GET/DELETE /api/projects/[id]` | FastAPI | Carrega ou exclui um projeto especifico |
| `POST /api/geo/validate-bbox` | Local | Validacao de bbox com `@urbanus/geo` |

O payload de projeto pode incluir `sewerNetwork` opcional. Quando presente, o editor reabre direto na rede processada salva em vez de reconstruir apenas o grafo derivado de `streets`.

### Paginas

| Rota | Componente | Descricao |
|------|-----------|-----------|
| `/` | `page.tsx` + `MapView` | Mapa de exploracao, selecao de area |
| `/projects` | `projects/page.tsx` | Lista de projetos salvos |
| `/projects/[id]` | `ProjectEditor` | Editor de grafos para projeto existente |

## Componentes de Mapa

### MapView (`components/map/MapView.tsx`)

Container principal do mapa de exploracao. Opera em dois modos:
- **explore**: mapa livre, usuario pode navegar e selecionar area
- **cropped**: area selecionada, mostra ruas e nos extraidos

Integra `BboxDrawControl`, `StreetsLayer` e `PreviewNodesLayer`.

### GraphMapView (`components/map/GraphMapView.tsx`)

Mapa do editor de grafos (usado em `ProjectEditor`). Recebe `center`, `zoom`, `bounds` e `streetFeatures` como props. Renderiza:
- `GraphLayers` (nos como circulos, arestas como linhas)
- `FlowArrows` (setas de direcao de fluxo)
- `GhostEdge` (preview durante add-edge)

Delega todas as interacoes ao hook `useGraphEditor`.

### GraphLayers (`components/map/GraphLayers.tsx`)

Duas camadas MapLibre sobre o mesmo GeoJSON source:
- **Nos**: `circle` layer com raio e cor baseados em feature-state (selected, hovered, error)
- **Arestas**: `line` layer com largura e cor baseados em feature-state

Usa `promoteId="id"` para habilitar `map.setFeatureState()` sem repaint do source. Isso permite feedback visual instantaneo (hover, selecao) sem recriar os GeoJSON features.

No modo de elevacao, `GraphLayers` enriquece os features com propriedades derivadas (`elevationColor`, `elevationLabel`) antes de enviar para o MapLibre. A rampa topografica e calculada no proprio React, e as layers usam apenas `['get', ...]` simples. Isso evita erros de parser/avaliacao de expressoes ao alternar dinamicamente entre os modos do editor.

Quando o editor esta exibindo uma `SewerNetwork` processada (via `sewerNetworkToGraph()`), a cor dos nos passa a seguir a semantica operacional da rede em vez da classificacao bruta do editor:
- `isCollectionPoint` -> `Collection point`
- `accessoryType=PV` -> `Manhole (PV)`
- `accessoryType=TIL` -> `Inspection terminal (TIL)`
- `accessoryType=TL` -> `Cleanout terminal (TL)`
- `accessoryType=CP` -> `Passing box (CP)`

O painel lateral (`PipelineResultsPanel`) usa as mesmas categorias e cores compartilhadas em `lib/sewer/renderLegend.ts`, e resolve os rotulos pelo dicionario de i18n (`apps/web/i18n/dictionaries/*`), evitando divergencia entre o que o mapa desenha e o que a legenda descreve em cada idioma.

### Estilos de Nos

```typescript
'circle-color': [
  'case',
  ['boolean', ['feature-state', 'error'], false], '#ef4444',    // vermelho (erro)
  ['boolean', ['feature-state', 'selected'], false], '#f97316', // laranja (selecionado)
  ['boolean', ['feature-state', 'hovered'], false], '#3b82f6',  // azul (hover)
  ['get', 'isCollectionPoint'], '#06b6d4',                      // collection point
  ['==', ['get', 'accessoryType'], 'PV'], '#f59e0b',            // manhole
  ['==', ['get', 'accessoryType'], 'TIL'], '#8b5cf6',           // inspection terminal
  ['==', ['get', 'accessoryType'], 'TL'], '#ec4899',            // cleanout terminal
  ['==', ['get', 'accessoryType'], 'CP'], '#22c55e',            // passing box
  ['get', 'isHighestElevation'], '#ef4444',                     // fallback do editor
  ['get', 'isLowestElevation'], '#06b6d4',                      // fallback do editor
  ['get', 'isEndpoint'], '#f59e0b',                             // fallback do editor
  '#8b5cf6'                                                      // violeta (padrao)
]
```

### Estilos de Arestas

```typescript
'line-color': [
  'case',
  ['boolean', ['feature-state', 'error'], false], '#ef4444',
  ['boolean', ['feature-state', 'selected'], false], '#f97316',
  ['boolean', ['feature-state', 'hovered'], false], '#3b82f6',
  '#64748b'   // slate (padrao)
]
```

### FlowArrows (`components/map/FlowArrows.tsx`)

Setas direcionais ao longo das arestas:
- Symbol layer com `symbol-placement: 'line'`
- Caracter: `▶` com espadamento de 80px
- Opacidade: 0.7, cor: `#475569`

### GhostEdge (`components/map/GhostEdge.tsx`)

Linha tracejada que acompanha o cursor durante o modo `add-edge`:
- Linha azul (`#3b82f6`) com `dasharray: [4, 4]`
- Opacidade: 0.6
- Conecta o no de origem ao cursor

### BboxDrawControl (`components/map/BboxDrawControl.tsx`)

Controle de selecao de area:
- Ativado por Shift + Drag
- Renderiza retangulo com fill e line layers
- Validacao em tempo real (area, coordenadas)
- Cor muda para vermelho em caso de erro (area excedida)
- Ao soltar: atualiza `areaSelectionStore.pendingBbox`

### StreetsLayer e PreviewNodesLayer

- `StreetsLayer`: LineStrings coloridas por tipo de via (highway)
- `PreviewNodesLayer`: circulos para nos extraidos em modo preview

## Paineis

### Toolbar (`components/panels/Toolbar.tsx`)

Barra de ferramentas flutuante com botoes de modo:

| Tecla | Modo | Icone | Descricao |
|-------|------|-------|-----------|
| V | select | Cursor | Selecionar nos e arestas |
| M | move | Move | Arrastar nos |
| A | add-node | Plus | Adicionar no (com snap) |
| E | add-edge | Link | Criar aresta entre nos |
| D | delete | Trash | Remover no ou aresta |
| S | split-edge | Scissors | Dividir aresta inserindo no |

Botoes de undo/redo desabilitados quando a pilha esta vazia.

### PropertyPanel (`components/panels/PropertyPanel.tsx`)

Inspector para a selecao atual:
- **No selecionado**: coordenadas, elevacao, tipo, rua, grau
- **Aresta selecionada**: comprimento, declividade, diâmetro, material
- **Multi-selecao**: resumo (contagem, tipos)

### ProcessingModal (`components/ProcessingModal.tsx`)

Modal de 3 estagios mostrado durante `startProcessing()`:

1. **Ruas** (Loader2 -> CheckCircle): busca via Overpass
2. **Topografia** (Loader2 -> CheckCircle): enriquecimento de elevacao
3. **Nos** (Loader2 -> CheckCircle): extracao e classificacao

Cada estagio pode ser: loading, success, error, ou skipped. Icones mudam dinamicamente. Fecha automaticamente ao completar.

## Modos de Edicao

Os 6 modos sao gerenciados pelo `graphStore.editingMode` e tratados pelo `useGraphEditor`:

### select

- Click em no/aresta: seleciona (limpa selecao anterior)
- Shift+click: adiciona/remove da selecao
- Click no fundo: limpa selecao

### move

- MouseDown em no: inicia drag
- MouseMove: atualiza posicao do no e arestas conectadas em tempo real
- MouseUp: commita `MoveNodeCommand` (suporta undo)

### add-node

- Click no mapa: cria no na posicao
- Snap automatico: prioriza nos existentes, depois geometria de ruas
- Raio de snap: 12px (convertido para metros no zoom atual)

### add-edge

- Primeiro click: seleciona no de origem (mostra GhostEdge)
- Segundo click: seleciona no de destino, cria aresta
- Escape: cancela

### delete

- Click em no: remove no e todas arestas conectadas
- Click em aresta: remove aresta

### split-edge

- Click em aresta: insere no no ponto clicado
- A aresta original e substituida por duas novas arestas
- Comando composto: `RemoveEdge` + `AddNode` + `AddEdge` x2
