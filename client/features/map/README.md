# Módulo Map

Este módulo contém toda a lógica relacionada ao mapa do URBANUS, incluindo:

- Seleção de área (bounding box)
- Processamento de ruas e elevação
- Edição de nós
- Visualização de dados

## Estrutura

```
features/map/
├── index.ts              # Exports públicos
├── context/              # Context e Provider
│   ├── MapContext.tsx
│   └── MapContext.types.ts
├── components/           # Componentes React
│   ├── NodesLayer.tsx
│   ├── NodeEditor.tsx
│   ├── MapControls.tsx
│   ├── MapInfoPanel.tsx
│   ├── CropConfirmDialog.tsx
│   ├── MapErrorBoundary.tsx
│   ├── MapLoading.tsx
│   ├── MapStatusBar.tsx
│   └── ElevationLegend.tsx
├── hooks/                # Hooks React
│   ├── useNodes.ts
│   ├── useNodeSelection.ts
│   ├── useNodeHistory.ts
│   ├── useNodeDrag.ts
│   ├── useElevation.ts
│   ├── useBoundingBox.ts
│   └── useMapKeyboard.ts
├── services/             # Serviços (singletons)
│   ├── NodesService.ts
│   ├── ElevationService.ts
│   ├── StreetsService.ts
│   └── BoundingBoxService.ts
├── validators/           # Validadores
│   ├── NodeValidator.ts
│   └── BboxValidator.ts
├── types/                # Types TypeScript
│   ├── map.types.ts
│   ├── bbox.types.ts
│   ├── node.types.ts
│   └── elevation.types.ts
├── constants/            # Constantes
│   └── map.constants.ts
└── utils/                # Utilitários
    ├── rateLimiter.ts
    └── retry.ts
```

## Uso Básico

### 1. Provider

Envolva sua aplicação com o `MapProvider`:

```tsx
import { MapProvider } from "@/features/map";

function App() {
  return (
    <MapProvider
      initialCenter={[-23.5505, -46.6333]}
      initialZoom={13}
      onBboxChange={(bbox) => console.log("Bbox:", bbox)}
      onError={(error) => console.error(error)}
    >
      <MapContent />
    </MapProvider>
  );
}
```

### 2. Context

Use o hook `useMapContext` para acessar o estado e ações:

```tsx
import { useMapContext } from '@/features/map';

function MapContent() {
  const {
    // Estado
    viewMode,
    nodes,
    stages,

    // Ações
    startProcessing,
    selectNode,
    undo,
    redo,
  } = useMapContext();

  return (
    // ...
  );
}
```

### 3. Componentes

Use os componentes prontos:

```tsx
import {
  MapControls,
  MapInfoPanel,
  NodesLayer,
  NodeEditor,
  CropConfirmDialog,
  MapErrorBoundary,
  MapLoading,
} from "@/features/map";

function MapUI() {
  const { isReady } = useMapContext();

  if (!isReady) {
    return <MapLoading />;
  }

  return (
    <MapErrorBoundary>
      <div className="relative h-full">
        <MapControls position="top-right" />
        <MapInfoPanel position="bottom-left" />
        <CropConfirmDialog />
      </div>
    </MapErrorBoundary>
  );
}
```

## Hooks Disponíveis

### useMapContext

Acesso completo ao contexto.

### useMapState

Apenas estado (sem ações).

### useBboxActions

Apenas ações de bounding box.

### useNodeActions

Apenas ações de nós.

### useProcessingActions

Apenas ações de processamento.

### useMapKeyboard

Atalhos de teclado globais.

### useNodes

Gerenciamento completo de nós (standalone).

### useElevation

Busca e processamento de elevação.

## Atalhos de Teclado

| Atalho         | Ação                    |
| -------------- | ----------------------- |
| `Ctrl+Z`       | Desfazer                |
| `Ctrl+Shift+Z` | Refazer                 |
| `Delete`       | Deletar selecionados    |
| `Esc`          | Limpar seleção / Voltar |
| `V`            | Modo selecionar         |
| `M`            | Modo mover              |
| `D`            | Modo deletar            |
| `N`            | Modo adicionar          |

## Rate Limiting

O módulo inclui rate limiting automático para APIs:

- **Streets**: 10 req/min
- **Topography**: 5 req/min
- **Node Operations**: 100 ops/min

## Error Handling

Use o `MapErrorBoundary` para capturar erros:

```tsx
<MapErrorBoundary
  onError={(error, info) => {
    // Log para analytics
  }}
  onReset={() => {
    // Limpar estado se necessário
  }}
>
  <MapContent />
</MapErrorBoundary>
```

## Retry Logic

Requests com falha são automaticamente retentados com backoff exponencial:

```tsx
import { withRetry, fetchWithRetry } from "@/features/map";

// Uso manual
const result = await withRetry(() => riskyOperation(), {
  maxRetries: 3,
  initialDelay: 1000,
});
```

## Tipos Principais

### MapNode

```typescript
interface MapNode {
  id: string;
  position: { lat: number; lng: number };
  elevation: number | null;
  streetId: string;
  isEndpoint: boolean;
  isSelected: boolean;
  isLocked?: boolean;
}
```

### BoundingBox

```typescript
interface BoundingBox {
  southWest: { lat: number; lng: number };
  northEast: { lat: number; lng: number };
}
```

### ViewMode

```typescript
type ViewMode = "explore" | "select" | "edit" | "cropped";
```

### NodeEditMode

```typescript
type NodeEditMode = "none" | "select" | "move" | "delete" | "add";
```
