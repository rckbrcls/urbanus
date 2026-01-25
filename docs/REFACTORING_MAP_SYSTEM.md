# Refatoração do Sistema de Mapas - URBANUS

> Documento de arquitetura e refatoração para o sistema de mapas, elevação, bounding box e gerenciamento de nós.

**Versão:** 1.0.0
**Data:** Janeiro 2026
**Status:** Proposta de Refatoração

---

## Índice

1. [Resumo Executivo](#1-resumo-executivo)
2. [Estado Atual do Sistema](#2-estado-atual-do-sistema)
3. [Problemas Identificados](#3-problemas-identificados)
4. [Nova Arquitetura Proposta](#4-nova-arquitetura-proposta)
5. [Refatoração: Bounding Box](#5-refatoração-bounding-box)
6. [Refatoração: Sistema de Elevação](#6-refatoração-sistema-de-elevação)
7. [Refatoração: Gerenciamento de Nós](#7-refatoração-gerenciamento-de-nós)
8. [Nova Funcionalidade: Edição de Nós](#8-nova-funcionalidade-edição-de-nós)
9. [Segurança e Validação](#9-segurança-e-validação)
10. [API e Contratos de Dados](#10-api-e-contratos-de-dados)
11. [Plano de Implementação](#11-plano-de-implementação)
12. [Testes](#12-testes)

---

## 1. Resumo Executivo

### 1.1 Objetivo

Este documento propõe uma refatoração completa do sistema de mapas do URBANUS, focando em:

- **Modularização** da lógica de mapa em serviços independentes
- **Robustez** no tratamento de erros e validações
- **Segurança** em todas as operações de dados geoespaciais
- **Nova funcionalidade** de seleção, movimentação e exclusão de nós

### 1.2 Escopo

| Componente | Ação |
|------------|------|
| Bounding Box | Refatorar para sistema baseado em estado com validações |
| Elevação | Criar serviço centralizado com cache |
| Nós de Rua | Implementar CRUD completo com interatividade |
| Map Instance | Separar em camadas gerenciáveis |
| API Routes | Unificar validações e tratamento de erros |

### 1.3 Benefícios Esperados

- Redução de **40%** no código duplicado
- **100%** de cobertura de validação em operações geoespaciais
- Experiência de usuário melhorada com feedback visual em tempo real
- Arquitetura preparada para futuras extensões (rotas, análises)

---

## 2. Estado Atual do Sistema

### 2.1 Arquitetura Atual

```
┌─────────────────────────────────────────────────────────────────┐
│                        Map.tsx (Componente Principal)            │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │ useMapInstance  │  │useBoundingBox    │  │useDataProcessing│ │
│  │                 │  │Drawing           │  │                │ │
│  └────────┬────────┘  └────────┬─────────┘  └───────┬────────┘ │
│           │                    │                     │          │
│           ▼                    ▼                     ▼          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Leaflet Map Instance                      ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
        ┌───────────┐   ┌───────────┐   ┌───────────────┐
        │/api/streets│   │/api/topo  │   │FastAPI Backend│
        └───────────┘   └───────────┘   └───────────────┘
```

### 2.2 Fluxo de Dados Atual

```
1. Usuário desenha bbox (Shift + Drag)
   └─► useBoundingBoxDrawing calcula área
       └─► Validação inline (< 100 km²)
           └─► handleValidSelection()
               └─► Modal de confirmação
                   └─► handleConfirmCrop()
                       └─► Trava mapa no bbox
                           └─► handleProcessData()
                               ├─► /api/streets (Overpass)
                               └─► /api/topography (OpenTopo)
                                   └─► addStreetsLayer()
                                       └─► Salvar projeto
```

### 2.3 Estrutura de Arquivos Atual

```
client/
├── components/
│   ├── Map.tsx                    # 400+ linhas, múltiplas responsabilidades
│   ├── ProcessingModal.tsx        # Não utilizado
│   └── TopographyPanel.tsx        # Isolado, não integrado
├── hooks/
│   ├── useMapInstance.ts          # Gerenciamento de instância Leaflet
│   ├── useBoundingBoxDrawing.ts   # Desenho de seleção
│   └── useDataProcessing.ts       # Busca de dados
├── utils/
│   └── elevation.ts               # Funções de elevação
├── stores/
│   ├── useMapStore.ts             # Estado persistido (Zustand)
│   └── useProjectStore.ts         # Projetos (React Query)
├── types/
│   └── map-types.ts               # Tipos TypeScript
└── constants/
    └── map-constants.ts           # Cores e configurações
```

### 2.4 Tecnologias em Uso

| Tecnologia | Versão | Propósito |
|------------|--------|-----------|
| Next.js | 16.0.8 | Framework React |
| React | 19.2.1 | UI Library |
| Leaflet | 1.9.4 | Renderização de mapas |
| react-leaflet | 5.0.0 | Integração React/Leaflet |
| Zustand | - | Estado local do mapa |
| React Query | - | Estado de servidor (projetos) |
| geotiff | - | Processamento de elevação |
| FastAPI | - | Backend Python |
| MongoDB | - | Persistência |

### 2.5 Coordenadas Padrão

- **Centro:** São Paulo, Brasil (-23.5505, -46.6333)
- **Zoom inicial:** 13
- **Área máxima:** 100 km²

---

## 3. Problemas Identificados

### 3.1 Duplicação de Código

| Código Duplicado | Localizações | Impacto |
|------------------|--------------|---------|
| `calculateArea()` | 4 arquivos diferentes | Inconsistência potencial |
| Validação de bbox | API routes + hooks | Lógica dispersa |
| Cores de highway | Constants + inline | Manutenção difícil |

**Exemplo de duplicação:**

```typescript
// Em useBoundingBoxDrawing.ts
function calculateArea(bbox: BoundingBox): number {
  const latDiff = bbox.northEast.lat - bbox.southWest.lat;
  const lonDiff = bbox.northEast.lng - bbox.southWest.lng;
  const avgLat = (bbox.northEast.lat + bbox.southWest.lat) / 2;
  const kmPerDegreeLat = 111.32;
  const kmPerDegreeLon = 111.32 * Math.cos((avgLat * Math.PI) / 180);
  return Math.abs(latDiff * kmPerDegreeLat * lonDiff * kmPerDegreeLon);
}

// Em /api/streets/route.ts
const latDiff = north - south;
const lonDiff = east - west;
const avgLat = (north + south) / 2;
// ... mesma lógica repetida

// Em /api/topography/route.ts
// ... mesma lógica novamente
```

### 3.2 Componente Map.tsx Sobrecarregado

O componente `Map.tsx` atualmente gerencia:

- Estado de visualização (cropped/full)
- Dimensões do crop
- Processamento de dados
- Modais de confirmação
- Salvamento de projetos
- Controles de UI

**Problema:** Violação do princípio de responsabilidade única (SRP).

### 3.3 Ausência de Gerenciamento de Nós

**Estado atual:**
- Nós são renderizados como `CircleMarker` read-only
- Não há interatividade com nós individuais
- Não é possível mover ou deletar nós
- Nós não têm estado próprio persistido

### 3.4 Tratamento de Erros Inconsistente

```typescript
// Atual - tratamento básico
try {
  const response = await fetch('/api/streets', ...);
  if (!response.ok) throw new Error('Failed');
} catch (error) {
  console.error(error); // Apenas log
}

// Problemas:
// - Mensagens genéricas
// - Sem retry
// - Sem feedback visual adequado
// - Sem categorização de erros
```

### 3.5 Falta de Cache de Elevação

```typescript
// Atual - carrega toda vez
const elevationData = await loadElevationData(blob);
// Processamento completo mesmo para mesma área
```

### 3.6 Validações Dispersas

| Validação | Frontend | Backend | Consistência |
|-----------|----------|---------|--------------|
| Área máxima | ✓ (100 km²) | ✓ (100 km²) | ✓ |
| Coordenadas válidas | Parcial | ✓ | ✗ |
| Bbox formato | ✗ | Parcial | ✗ |
| GeoJSON válido | ✗ | ✗ | ✗ |

---

## 4. Nova Arquitetura Proposta

### 4.1 Visão Geral

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              MAP MODULE                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│  │  MapContainer    │  │  MapToolbar      │  │  MapStatusBar    │      │
│  │  (Visualização)  │  │  (Controles)     │  │  (Feedback)      │      │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘      │
│           │                     │                      │                │
│           └─────────────────────┼──────────────────────┘                │
│                                 ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                        MAP CONTEXT                                │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │  │
│  │  │ ViewState   │  │ Selection   │  │ Nodes       │              │  │
│  │  │ Manager     │  │ Manager     │  │ Manager     │              │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                 │                                        │
│           ┌─────────────────────┼─────────────────────┐                │
│           ▼                     ▼                     ▼                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│  │ BoundingBox     │  │ Elevation       │  │ Streets         │        │
│  │ Service         │  │ Service         │  │ Service         │        │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           VALIDATION LAYER                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│  │ GeoValidator    │  │ BboxValidator   │  │ NodeValidator   │        │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘        │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              API LAYER                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│  │ /api/geo/*      │  │ /api/projects/* │  │ /api/nodes/*    │        │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘        │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Nova Estrutura de Arquivos

```
client/
├── features/
│   └── map/
│       ├── components/
│       │   ├── MapContainer.tsx         # Container principal limpo
│       │   ├── MapCanvas.tsx            # Renderização Leaflet
│       │   ├── MapToolbar.tsx           # Barra de ferramentas
│       │   ├── MapStatusBar.tsx         # Status e feedback
│       │   ├── BoundingBoxOverlay.tsx   # Seleção de área
│       │   ├── StreetsLayer.tsx         # Camada de ruas
│       │   ├── NodesLayer.tsx           # Camada de nós (NOVO)
│       │   ├── NodeEditor.tsx           # Editor de nó (NOVO)
│       │   └── ElevationLegend.tsx      # Legenda de elevação
│       │
│       ├── hooks/
│       │   ├── useMapContext.ts         # Context principal
│       │   ├── useMapInstance.ts        # Instância Leaflet (refatorado)
│       │   ├── useBoundingBox.ts        # Seleção (refatorado)
│       │   ├── useNodes.ts              # Gerenciamento de nós (NOVO)
│       │   ├── useNodeSelection.ts      # Seleção de nó (NOVO)
│       │   ├── useNodeDrag.ts           # Arrastar nó (NOVO)
│       │   └── useElevation.ts          # Elevação (refatorado)
│       │
│       ├── services/
│       │   ├── BoundingBoxService.ts    # Lógica de bbox
│       │   ├── ElevationService.ts      # Cache e processamento
│       │   ├── StreetsService.ts        # Busca de ruas
│       │   └── NodesService.ts          # CRUD de nós (NOVO)
│       │
│       ├── validators/
│       │   ├── GeoValidator.ts          # Validações geoespaciais
│       │   ├── BboxValidator.ts         # Validações de bbox
│       │   └── NodeValidator.ts         # Validações de nó (NOVO)
│       │
│       ├── types/
│       │   ├── map.types.ts             # Tipos do mapa
│       │   ├── bbox.types.ts            # Tipos de bbox
│       │   ├── node.types.ts            # Tipos de nó (NOVO)
│       │   └── elevation.types.ts       # Tipos de elevação
│       │
│       ├── constants/
│       │   └── map.constants.ts         # Todas as constantes
│       │
│       ├── context/
│       │   └── MapContext.tsx           # Provider do mapa
│       │
│       └── index.ts                     # Exports públicos
│
├── lib/
│   └── geo/
│       ├── calculations.ts              # Cálculos geoespaciais
│       ├── projections.ts               # Projeções de coordenadas
│       └── validations.ts               # Validações compartilhadas
│
└── app/
    └── api/
        └── geo/
            ├── streets/route.ts         # Ruas (refatorado)
            ├── topography/route.ts      # Topografia (refatorado)
            ├── validate-bbox/route.ts   # Validação de bbox (NOVO)
            └── nodes/
                ├── route.ts             # CRUD de nós (NOVO)
                └── [id]/route.ts        # Operações por ID (NOVO)
```

### 4.3 Map Context

```typescript
// client/features/map/context/MapContext.tsx

interface MapContextState {
  // View State
  viewMode: 'explore' | 'select' | 'edit' | 'cropped';
  center: LatLng;
  zoom: number;

  // Bounding Box
  bbox: BoundingBox | null;
  bboxValidation: BboxValidationResult | null;

  // Nodes
  nodes: MapNode[];
  selectedNodeId: string | null;
  nodeEditMode: 'none' | 'select' | 'move' | 'delete';

  // Data
  streets: GeoJSON.FeatureCollection | null;
  elevationData: ElevationData | null;

  // UI State
  isProcessing: boolean;
  processingStage: ProcessingStage;
  errors: MapError[];
}

interface MapContextActions {
  // View
  setViewMode: (mode: ViewMode) => void;
  updateView: (center: LatLng, zoom: number) => void;

  // Bounding Box
  startBboxSelection: () => void;
  updateBboxSelection: (bbox: BoundingBox) => void;
  confirmBboxSelection: () => Promise<BboxValidationResult>;
  clearBboxSelection: () => void;

  // Nodes
  selectNode: (nodeId: string | null) => void;
  moveNode: (nodeId: string, newPosition: LatLng) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  setNodeEditMode: (mode: NodeEditMode) => void;

  // Data
  fetchStreets: () => Promise<void>;
  fetchElevation: () => Promise<void>;

  // Errors
  addError: (error: MapError) => void;
  clearErrors: () => void;
}

const MapContext = createContext<MapContextState & MapContextActions>(null!);
```

---

## 5. Refatoração: Bounding Box

### 5.1 Novo Sistema de Seleção

```typescript
// client/features/map/services/BoundingBoxService.ts

import { BboxValidator } from '../validators/BboxValidator';
import { GeoCalculations } from '@/lib/geo/calculations';

export class BoundingBoxService {
  private static instance: BoundingBoxService;
  private validator: BboxValidator;

  private constructor() {
    this.validator = new BboxValidator();
  }

  static getInstance(): BoundingBoxService {
    if (!this.instance) {
      this.instance = new BoundingBoxService();
    }
    return this.instance;
  }

  /**
   * Cria um bbox a partir de dois pontos de clique
   */
  createFromPoints(start: LatLng, end: LatLng): BoundingBox {
    return {
      southWest: {
        lat: Math.min(start.lat, end.lat),
        lng: Math.min(start.lng, end.lng),
      },
      northEast: {
        lat: Math.max(start.lat, end.lat),
        lng: Math.max(start.lng, end.lng),
      },
    };
  }

  /**
   * Valida um bbox com todas as regras de negócio
   */
  async validate(bbox: BoundingBox): Promise<BboxValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 1. Validação de formato
    const formatResult = this.validator.validateFormat(bbox);
    if (!formatResult.valid) {
      return { valid: false, errors: formatResult.errors };
    }

    // 2. Validação de coordenadas
    const coordResult = this.validator.validateCoordinates(bbox);
    if (!coordResult.valid) {
      return { valid: false, errors: coordResult.errors };
    }

    // 3. Cálculo de área
    const area = GeoCalculations.calculateArea(bbox);

    // 4. Validação de área
    if (area > MAX_BBOX_AREA_KM2) {
      errors.push({
        code: 'AREA_TOO_LARGE',
        message: `Área selecionada (${area.toFixed(2)} km²) excede o limite de ${MAX_BBOX_AREA_KM2} km²`,
        field: 'area',
      });
    }

    if (area < MIN_BBOX_AREA_KM2) {
      errors.push({
        code: 'AREA_TOO_SMALL',
        message: `Área selecionada (${area.toFixed(4)} km²) é menor que o mínimo de ${MIN_BBOX_AREA_KM2} km²`,
        field: 'area',
      });
    }

    // 5. Avisos
    if (area > BBOX_AREA_WARNING_THRESHOLD) {
      warnings.push({
        code: 'LARGE_AREA',
        message: 'Áreas grandes podem demorar mais para processar',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        area,
        center: GeoCalculations.getCenter(bbox),
        dimensions: GeoCalculations.getDimensions(bbox),
      },
    };
  }

  /**
   * Expande ou contrai um bbox por uma margem
   */
  adjustByMargin(bbox: BoundingBox, marginKm: number): BoundingBox {
    const marginLat = marginKm / 111.32;
    const avgLat = (bbox.northEast.lat + bbox.southWest.lat) / 2;
    const marginLng = marginKm / (111.32 * Math.cos(avgLat * Math.PI / 180));

    return {
      southWest: {
        lat: bbox.southWest.lat - marginLat,
        lng: bbox.southWest.lng - marginLng,
      },
      northEast: {
        lat: bbox.northEast.lat + marginLat,
        lng: bbox.northEast.lng + marginLng,
      },
    };
  }

  /**
   * Converte bbox para formato de query string
   */
  toQueryParams(bbox: BoundingBox): URLSearchParams {
    return new URLSearchParams({
      south: bbox.southWest.lat.toString(),
      west: bbox.southWest.lng.toString(),
      north: bbox.northEast.lat.toString(),
      east: bbox.northEast.lng.toString(),
    });
  }

  /**
   * Converte bbox para formato Overpass
   */
  toOverpassBbox(bbox: BoundingBox): string {
    return `${bbox.southWest.lat},${bbox.southWest.lng},${bbox.northEast.lat},${bbox.northEast.lng}`;
  }
}
```

### 5.2 Validador de Bounding Box

```typescript
// client/features/map/validators/BboxValidator.ts

export class BboxValidator {
  /**
   * Valida o formato do bbox
   */
  validateFormat(bbox: unknown): ValidationResult {
    const errors: ValidationError[] = [];

    if (!bbox || typeof bbox !== 'object') {
      return {
        valid: false,
        errors: [{ code: 'INVALID_FORMAT', message: 'Bbox deve ser um objeto' }],
      };
    }

    const b = bbox as Record<string, unknown>;

    if (!this.isValidLatLng(b.southWest)) {
      errors.push({
        code: 'INVALID_SOUTHWEST',
        message: 'southWest deve ter lat e lng válidos',
        field: 'southWest',
      });
    }

    if (!this.isValidLatLng(b.northEast)) {
      errors.push({
        code: 'INVALID_NORTHEAST',
        message: 'northEast deve ter lat e lng válidos',
        field: 'northEast',
      });
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Valida se as coordenadas estão em ranges válidos
   */
  validateCoordinates(bbox: BoundingBox): ValidationResult {
    const errors: ValidationError[] = [];

    // Latitude: -90 a 90
    if (!this.isValidLatitude(bbox.southWest.lat)) {
      errors.push({
        code: 'INVALID_LATITUDE',
        message: `Latitude sul (${bbox.southWest.lat}) fora do range válido (-90 a 90)`,
        field: 'southWest.lat',
      });
    }

    if (!this.isValidLatitude(bbox.northEast.lat)) {
      errors.push({
        code: 'INVALID_LATITUDE',
        message: `Latitude norte (${bbox.northEast.lat}) fora do range válido (-90 a 90)`,
        field: 'northEast.lat',
      });
    }

    // Longitude: -180 a 180
    if (!this.isValidLongitude(bbox.southWest.lng)) {
      errors.push({
        code: 'INVALID_LONGITUDE',
        message: `Longitude oeste (${bbox.southWest.lng}) fora do range válido (-180 a 180)`,
        field: 'southWest.lng',
      });
    }

    if (!this.isValidLongitude(bbox.northEast.lng)) {
      errors.push({
        code: 'INVALID_LONGITUDE',
        message: `Longitude leste (${bbox.northEast.lng}) fora do range válido (-180 a 180)`,
        field: 'northEast.lng',
      });
    }

    // Verificar se south < north
    if (bbox.southWest.lat >= bbox.northEast.lat) {
      errors.push({
        code: 'INVALID_LAT_ORDER',
        message: 'Latitude sul deve ser menor que latitude norte',
        field: 'latitude',
      });
    }

    // Verificar se west < east (considerando antimeridiano)
    if (bbox.southWest.lng >= bbox.northEast.lng) {
      errors.push({
        code: 'INVALID_LNG_ORDER',
        message: 'Longitude oeste deve ser menor que longitude leste',
        field: 'longitude',
      });
    }

    return { valid: errors.length === 0, errors };
  }

  private isValidLatLng(value: unknown): value is LatLng {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return typeof v.lat === 'number' && typeof v.lng === 'number' &&
           !isNaN(v.lat) && !isNaN(v.lng);
  }

  private isValidLatitude(lat: number): boolean {
    return lat >= -90 && lat <= 90;
  }

  private isValidLongitude(lng: number): boolean {
    return lng >= -180 && lng <= 180;
  }
}
```

### 5.3 Hook Refatorado de Bounding Box

```typescript
// client/features/map/hooks/useBoundingBox.ts

import { useCallback, useRef, useState } from 'react';
import { BoundingBoxService } from '../services/BoundingBoxService';
import { useMapContext } from './useMapContext';

interface UseBoundingBoxOptions {
  onSelectionStart?: () => void;
  onSelectionUpdate?: (bbox: BoundingBox, area: number) => void;
  onSelectionEnd?: (result: BboxValidationResult) => void;
  onSelectionCancel?: () => void;
}

export function useBoundingBox(options: UseBoundingBoxOptions = {}) {
  const { mapInstance, viewMode, setViewMode } = useMapContext();
  const service = BoundingBoxService.getInstance();

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentBbox, setCurrentBbox] = useState<BoundingBox | null>(null);
  const [validation, setValidation] = useState<BboxValidationResult | null>(null);

  const startPointRef = useRef<LatLng | null>(null);
  const rectangleRef = useRef<L.Rectangle | null>(null);

  /**
   * Inicia o modo de seleção de bbox
   */
  const startSelection = useCallback(() => {
    if (!mapInstance) return;

    setViewMode('select');
    mapInstance.getContainer().style.cursor = 'crosshair';

    // Desabilita interações padrão do mapa
    mapInstance.dragging.disable();
    mapInstance.doubleClickZoom.disable();
  }, [mapInstance, setViewMode]);

  /**
   * Handler para início do desenho (mousedown)
   */
  const handleDrawStart = useCallback((e: L.LeafletMouseEvent) => {
    if (viewMode !== 'select') return;

    startPointRef.current = e.latlng;
    setIsDrawing(true);
    options.onSelectionStart?.();

    // Cria retângulo inicial
    rectangleRef.current = L.rectangle(
      [e.latlng, e.latlng],
      {
        color: BBOX_COLORS.valid,
        weight: 2,
        fillOpacity: 0.1,
        dashArray: '5, 5',
      }
    ).addTo(mapInstance!);
  }, [mapInstance, viewMode, options]);

  /**
   * Handler para atualização do desenho (mousemove)
   */
  const handleDrawUpdate = useCallback((e: L.LeafletMouseEvent) => {
    if (!isDrawing || !startPointRef.current || !rectangleRef.current) return;

    const bbox = service.createFromPoints(startPointRef.current, e.latlng);
    setCurrentBbox(bbox);

    // Atualiza retângulo visual
    rectangleRef.current.setBounds([
      [bbox.southWest.lat, bbox.southWest.lng],
      [bbox.northEast.lat, bbox.northEast.lng],
    ]);

    // Calcula área e atualiza estilo
    const area = GeoCalculations.calculateArea(bbox);
    const isValid = area <= MAX_BBOX_AREA_KM2 && area >= MIN_BBOX_AREA_KM2;

    rectangleRef.current.setStyle({
      color: isValid ? BBOX_COLORS.valid : BBOX_COLORS.invalid,
    });

    options.onSelectionUpdate?.(bbox, area);
  }, [isDrawing, service, options]);

  /**
   * Handler para fim do desenho (mouseup)
   */
  const handleDrawEnd = useCallback(async () => {
    if (!isDrawing || !currentBbox) return;

    setIsDrawing(false);
    startPointRef.current = null;

    // Valida bbox
    const result = await service.validate(currentBbox);
    setValidation(result);

    if (result.valid) {
      rectangleRef.current?.setStyle({
        color: BBOX_COLORS.confirmed,
        dashArray: undefined,
      });
    } else {
      // Remove retângulo inválido após delay
      setTimeout(() => {
        rectangleRef.current?.remove();
        rectangleRef.current = null;
      }, 2000);
    }

    options.onSelectionEnd?.(result);
  }, [isDrawing, currentBbox, service, options]);

  /**
   * Cancela seleção atual
   */
  const cancelSelection = useCallback(() => {
    setIsDrawing(false);
    setCurrentBbox(null);
    setValidation(null);
    startPointRef.current = null;

    rectangleRef.current?.remove();
    rectangleRef.current = null;

    if (mapInstance) {
      mapInstance.getContainer().style.cursor = '';
      mapInstance.dragging.enable();
      mapInstance.doubleClickZoom.enable();
    }

    setViewMode('explore');
    options.onSelectionCancel?.();
  }, [mapInstance, setViewMode, options]);

  /**
   * Confirma seleção e trava mapa
   */
  const confirmSelection = useCallback(() => {
    if (!currentBbox || !validation?.valid || !mapInstance) return;

    // Trava mapa no bbox
    mapInstance.fitBounds([
      [currentBbox.southWest.lat, currentBbox.southWest.lng],
      [currentBbox.northEast.lat, currentBbox.northEast.lng],
    ], { padding: [20, 20] });

    mapInstance.setMaxBounds([
      [currentBbox.southWest.lat - 0.01, currentBbox.southWest.lng - 0.01],
      [currentBbox.northEast.lat + 0.01, currentBbox.northEast.lng + 0.01],
    ]);

    setViewMode('cropped');
  }, [currentBbox, validation, mapInstance, setViewMode]);

  return {
    // State
    isDrawing,
    currentBbox,
    validation,

    // Actions
    startSelection,
    cancelSelection,
    confirmSelection,

    // Event handlers (para anexar ao mapa)
    handlers: {
      onMouseDown: handleDrawStart,
      onMouseMove: handleDrawUpdate,
      onMouseUp: handleDrawEnd,
    },
  };
}
```

---

## 6. Refatoração: Sistema de Elevação

### 6.1 Serviço de Elevação com Cache

```typescript
// client/features/map/services/ElevationService.ts

import { loadElevationData, lookupElevation } from '@/lib/geo/elevation';

interface CacheEntry {
  data: ElevationData;
  bbox: BoundingBox;
  timestamp: number;
}

export class ElevationService {
  private static instance: ElevationService;
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutos
  private readonly MAX_CACHE_SIZE = 10;

  private constructor() {}

  static getInstance(): ElevationService {
    if (!this.instance) {
      this.instance = new ElevationService();
    }
    return this.instance;
  }

  /**
   * Gera chave de cache para um bbox
   */
  private getCacheKey(bbox: BoundingBox): string {
    return `${bbox.southWest.lat.toFixed(4)},${bbox.southWest.lng.toFixed(4)},${bbox.northEast.lat.toFixed(4)},${bbox.northEast.lng.toFixed(4)}`;
  }

  /**
   * Verifica se existe cache válido
   */
  private getCachedData(bbox: BoundingBox): ElevationData | null {
    const key = this.getCacheKey(bbox);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Verifica TTL
    if (Date.now() - entry.timestamp > this.CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Adiciona dados ao cache
   */
  private setCachedData(bbox: BoundingBox, data: ElevationData): void {
    // Remove entradas antigas se cache cheio
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = Array.from(this.cache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)[0][0];
      this.cache.delete(oldestKey);
    }

    this.cache.set(this.getCacheKey(bbox), {
      data,
      bbox,
      timestamp: Date.now(),
    });
  }

  /**
   * Busca dados de elevação para um bbox
   */
  async fetchElevation(
    bbox: BoundingBox,
    options: ElevationFetchOptions = {}
  ): Promise<ElevationResult> {
    const { demType = 'COP30', useCache = true } = options;

    // Verifica cache
    if (useCache) {
      const cached = this.getCachedData(bbox);
      if (cached) {
        return { data: cached, fromCache: true };
      }
    }

    try {
      const response = await fetch('/api/geo/topography', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          south: bbox.southWest.lat,
          west: bbox.southWest.lng,
          north: bbox.northEast.lat,
          east: bbox.northEast.lng,
          demType,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new ElevationError(error.message || 'Falha ao buscar elevação', error.code);
      }

      const blob = await response.blob();
      const data = await loadElevationData(blob);

      // Valida dados
      if (!this.validateElevationData(data)) {
        throw new ElevationError('Dados de elevação inválidos', 'INVALID_DATA');
      }

      // Cache
      if (useCache) {
        this.setCachedData(bbox, data);
      }

      return { data, fromCache: false };
    } catch (error) {
      if (error instanceof ElevationError) throw error;
      throw new ElevationError(
        `Erro ao processar elevação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        'PROCESSING_ERROR'
      );
    }
  }

  /**
   * Valida integridade dos dados de elevação
   */
  private validateElevationData(data: ElevationData): boolean {
    if (!data.data || !data.width || !data.height || !data.bbox) {
      return false;
    }

    if (data.data.length !== data.width * data.height) {
      return false;
    }

    // Verifica se tem dados válidos (não todos nodata)
    const validCount = Array.from(data.data).filter(v => v > -9000).length;
    return validCount > 0;
  }

  /**
   * Obtém elevação para um ponto específico
   */
  getElevationAtPoint(data: ElevationData, lat: number, lng: number): number | null {
    return lookupElevation(data, lat, lng);
  }

  /**
   * Obtém elevações para múltiplos pontos (batch)
   */
  getElevationsAtPoints(
    data: ElevationData,
    points: LatLng[]
  ): (number | null)[] {
    return points.map(point => this.getElevationAtPoint(data, point.lat, point.lng));
  }

  /**
   * Calcula estatísticas de elevação para um conjunto de pontos
   */
  calculateStats(elevations: (number | null)[]): ElevationStats {
    const valid = elevations.filter((e): e is number => e !== null);

    if (valid.length === 0) {
      return { min: null, max: null, avg: null, count: 0 };
    }

    return {
      min: Math.min(...valid),
      max: Math.max(...valid),
      avg: valid.reduce((a, b) => a + b, 0) / valid.length,
      count: valid.length,
    };
  }

  /**
   * Enriquece GeoJSON com dados de elevação
   */
  async enrichGeoJSON(
    geojson: GeoJSON.FeatureCollection,
    elevationData: ElevationData
  ): Promise<GeoJSON.FeatureCollection> {
    const enrichedFeatures = geojson.features.map(feature => {
      if (feature.geometry.type !== 'LineString') {
        return feature;
      }

      const coordinates = feature.geometry.coordinates as [number, number][];
      const elevations = coordinates.map(([lng, lat]) =>
        this.getElevationAtPoint(elevationData, lat, lng)
      );

      const stats = this.calculateStats(elevations);

      return {
        ...feature,
        properties: {
          ...feature.properties,
          elevation: stats,
          vertex_elevations: elevations,
        },
      };
    });

    return {
      ...geojson,
      features: enrichedFeatures,
    };
  }

  /**
   * Limpa cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Classe de erro customizada
export class ElevationError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'ElevationError';
  }
}
```

### 6.2 Hook de Elevação

```typescript
// client/features/map/hooks/useElevation.ts

import { useState, useCallback } from 'react';
import { ElevationService, ElevationError } from '../services/ElevationService';
import { useMapContext } from './useMapContext';

interface UseElevationReturn {
  elevationData: ElevationData | null;
  isLoading: boolean;
  error: ElevationError | null;
  fromCache: boolean;

  fetchElevation: (bbox: BoundingBox) => Promise<void>;
  getElevationAt: (lat: number, lng: number) => number | null;
  enrichStreets: (geojson: GeoJSON.FeatureCollection) => Promise<GeoJSON.FeatureCollection>;
  clearCache: () => void;
}

export function useElevation(): UseElevationReturn {
  const service = ElevationService.getInstance();
  const { bbox } = useMapContext();

  const [elevationData, setElevationData] = useState<ElevationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ElevationError | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const fetchElevation = useCallback(async (targetBbox: BoundingBox) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await service.fetchElevation(targetBbox);
      setElevationData(result.data);
      setFromCache(result.fromCache);
    } catch (err) {
      setError(err instanceof ElevationError ? err : new ElevationError(
        'Erro desconhecido ao buscar elevação',
        'UNKNOWN_ERROR'
      ));
      setElevationData(null);
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  const getElevationAt = useCallback((lat: number, lng: number): number | null => {
    if (!elevationData) return null;
    return service.getElevationAtPoint(elevationData, lat, lng);
  }, [elevationData, service]);

  const enrichStreets = useCallback(async (
    geojson: GeoJSON.FeatureCollection
  ): Promise<GeoJSON.FeatureCollection> => {
    if (!elevationData) return geojson;
    return service.enrichGeoJSON(geojson, elevationData);
  }, [elevationData, service]);

  const clearCache = useCallback(() => {
    service.clearCache();
  }, [service]);

  return {
    elevationData,
    isLoading,
    error,
    fromCache,
    fetchElevation,
    getElevationAt,
    enrichStreets,
    clearCache,
  };
}
```

---

## 7. Refatoração: Gerenciamento de Nós

### 7.1 Tipos de Nó

```typescript
// client/features/map/types/node.types.ts

/**
 * Representa um nó no mapa (vértice de uma rua)
 */
export interface MapNode {
  id: string;
  position: LatLng;
  elevation: number | null;

  // Metadados
  streetId: string;           // ID da rua pai
  vertexIndex: number;        // Índice no array de coordenadas
  isEndpoint: boolean;        // Se é início/fim da rua

  // Estado
  isSelected: boolean;
  isHovered: boolean;
  isDragging: boolean;

  // Timestamps
  createdAt: number;
  updatedAt: number;
}

/**
 * Ação de edição de nó (para histórico/undo)
 */
export interface NodeAction {
  type: 'move' | 'delete' | 'create';
  nodeId: string;
  previousState: Partial<MapNode>;
  newState: Partial<MapNode>;
  timestamp: number;
}

/**
 * Resultado de validação de movimento
 */
export interface MoveValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  snapSuggestion?: LatLng;  // Sugestão de snap to grid/road
}

/**
 * Opções de visualização de nós
 */
export interface NodeDisplayOptions {
  showAll: boolean;
  showOnlySelected: boolean;
  showElevation: boolean;
  highlightEndpoints: boolean;

  // Estilos
  defaultRadius: number;
  selectedRadius: number;
  defaultColor: string;
  selectedColor: string;
  endpointColor: string;
}

/**
 * Modo de edição de nós
 */
export type NodeEditMode = 'none' | 'select' | 'move' | 'delete';
```

### 7.2 Serviço de Nós

```typescript
// client/features/map/services/NodesService.ts

import { v4 as uuidv4 } from 'uuid';
import { NodeValidator } from '../validators/NodeValidator';

export class NodesService {
  private static instance: NodesService;
  private validator: NodeValidator;
  private actionHistory: NodeAction[] = [];
  private readonly MAX_HISTORY = 50;

  private constructor() {
    this.validator = new NodeValidator();
  }

  static getInstance(): NodesService {
    if (!this.instance) {
      this.instance = new NodesService();
    }
    return this.instance;
  }

  /**
   * Extrai nós de um GeoJSON de ruas
   */
  extractNodesFromStreets(streets: GeoJSON.FeatureCollection): MapNode[] {
    const nodes: MapNode[] = [];
    const nodeMap = new Map<string, MapNode>(); // Para detectar nós compartilhados

    streets.features.forEach(feature => {
      if (feature.geometry.type !== 'LineString') return;

      const streetId = feature.properties?.id?.toString() || uuidv4();
      const coordinates = feature.geometry.coordinates as [number, number][];
      const elevations = feature.properties?.vertex_elevations as (number | null)[] || [];

      coordinates.forEach((coord, index) => {
        const [lng, lat] = coord;
        const posKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;

        // Verifica se já existe nó nessa posição (interseção)
        if (nodeMap.has(posKey)) {
          // Nó compartilhado - atualiza para marcar como não endpoint
          const existing = nodeMap.get(posKey)!;
          existing.isEndpoint = false;
          return;
        }

        const node: MapNode = {
          id: uuidv4(),
          position: { lat, lng },
          elevation: elevations[index] ?? null,
          streetId,
          vertexIndex: index,
          isEndpoint: index === 0 || index === coordinates.length - 1,
          isSelected: false,
          isHovered: false,
          isDragging: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        nodes.push(node);
        nodeMap.set(posKey, node);
      });
    });

    return nodes;
  }

  /**
   * Valida movimento de um nó
   */
  async validateMove(
    node: MapNode,
    newPosition: LatLng,
    allNodes: MapNode[],
    bbox: BoundingBox
  ): Promise<MoveValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 1. Verifica se nova posição está dentro do bbox
    if (!this.isInsideBbox(newPosition, bbox)) {
      errors.push({
        code: 'OUTSIDE_BOUNDS',
        message: 'Nova posição está fora da área selecionada',
      });
    }

    // 2. Verifica distância mínima de outros nós
    const tooClose = allNodes.find(other => {
      if (other.id === node.id) return false;
      const distance = this.calculateDistance(newPosition, other.position);
      return distance < MIN_NODE_DISTANCE_METERS;
    });

    if (tooClose) {
      warnings.push({
        code: 'TOO_CLOSE',
        message: `Nó muito próximo de outro nó (< ${MIN_NODE_DISTANCE_METERS}m)`,
      });
    }

    // 3. Verifica se movimento é muito grande (possível erro do usuário)
    const moveDistance = this.calculateDistance(node.position, newPosition);
    if (moveDistance > MAX_MOVE_DISTANCE_METERS) {
      warnings.push({
        code: 'LARGE_MOVE',
        message: `Movimento grande detectado (${moveDistance.toFixed(0)}m)`,
      });
    }

    // 4. Sugestão de snap (opcional)
    let snapSuggestion: LatLng | undefined;
    const nearestNode = this.findNearestNode(newPosition, allNodes, node.id);
    if (nearestNode && this.calculateDistance(newPosition, nearestNode.position) < SNAP_DISTANCE_METERS) {
      snapSuggestion = nearestNode.position;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      snapSuggestion,
    };
  }

  /**
   * Move um nó para nova posição
   */
  moveNode(
    nodes: MapNode[],
    nodeId: string,
    newPosition: LatLng
  ): { nodes: MapNode[]; action: NodeAction } {
    const nodeIndex = nodes.findIndex(n => n.id === nodeId);
    if (nodeIndex === -1) {
      throw new Error(`Nó não encontrado: ${nodeId}`);
    }

    const node = nodes[nodeIndex];
    const previousState = { position: { ...node.position } };

    const updatedNodes = [...nodes];
    updatedNodes[nodeIndex] = {
      ...node,
      position: newPosition,
      updatedAt: Date.now(),
    };

    const action: NodeAction = {
      type: 'move',
      nodeId,
      previousState,
      newState: { position: newPosition },
      timestamp: Date.now(),
    };

    this.addToHistory(action);

    return { nodes: updatedNodes, action };
  }

  /**
   * Remove um nó
   */
  deleteNode(
    nodes: MapNode[],
    nodeId: string
  ): { nodes: MapNode[]; action: NodeAction } {
    const nodeIndex = nodes.findIndex(n => n.id === nodeId);
    if (nodeIndex === -1) {
      throw new Error(`Nó não encontrado: ${nodeId}`);
    }

    const node = nodes[nodeIndex];

    // Não permite deletar endpoints (quebraria a geometria da rua)
    if (node.isEndpoint) {
      throw new NodeValidationError(
        'Não é possível deletar endpoints de ruas',
        'CANNOT_DELETE_ENDPOINT'
      );
    }

    const action: NodeAction = {
      type: 'delete',
      nodeId,
      previousState: { ...node },
      newState: {},
      timestamp: Date.now(),
    };

    const updatedNodes = nodes.filter(n => n.id !== nodeId);
    this.addToHistory(action);

    return { nodes: updatedNodes, action };
  }

  /**
   * Desfaz última ação
   */
  undo(nodes: MapNode[]): { nodes: MapNode[]; undoneAction: NodeAction | null } {
    const action = this.actionHistory.pop();
    if (!action) {
      return { nodes, undoneAction: null };
    }

    let updatedNodes = [...nodes];

    switch (action.type) {
      case 'move': {
        const nodeIndex = updatedNodes.findIndex(n => n.id === action.nodeId);
        if (nodeIndex !== -1) {
          updatedNodes[nodeIndex] = {
            ...updatedNodes[nodeIndex],
            position: action.previousState.position!,
            updatedAt: Date.now(),
          };
        }
        break;
      }
      case 'delete': {
        // Restaura nó deletado
        updatedNodes.push(action.previousState as MapNode);
        break;
      }
    }

    return { nodes: updatedNodes, undoneAction: action };
  }

  /**
   * Aplica modificações de nós de volta ao GeoJSON
   */
  applyNodesToStreets(
    streets: GeoJSON.FeatureCollection,
    nodes: MapNode[]
  ): GeoJSON.FeatureCollection {
    // Agrupa nós por streetId
    const nodesByStreet = new Map<string, MapNode[]>();
    nodes.forEach(node => {
      const existing = nodesByStreet.get(node.streetId) || [];
      existing.push(node);
      nodesByStreet.set(node.streetId, existing);
    });

    const updatedFeatures = streets.features.map(feature => {
      const streetId = feature.properties?.id?.toString();
      if (!streetId || feature.geometry.type !== 'LineString') {
        return feature;
      }

      const streetNodes = nodesByStreet.get(streetId);
      if (!streetNodes) return feature;

      // Ordena por vertexIndex e reconstrói coordenadas
      const sortedNodes = [...streetNodes].sort((a, b) => a.vertexIndex - b.vertexIndex);
      const newCoordinates = sortedNodes.map(node => [node.position.lng, node.position.lat]);

      return {
        ...feature,
        geometry: {
          ...feature.geometry,
          coordinates: newCoordinates,
        },
      };
    });

    return {
      ...streets,
      features: updatedFeatures,
    };
  }

  // ============ MÉTODOS AUXILIARES PRIVADOS ============

  private isInsideBbox(position: LatLng, bbox: BoundingBox): boolean {
    return (
      position.lat >= bbox.southWest.lat &&
      position.lat <= bbox.northEast.lat &&
      position.lng >= bbox.southWest.lng &&
      position.lng <= bbox.northEast.lng
    );
  }

  private calculateDistance(p1: LatLng, p2: LatLng): number {
    // Haversine simplificado (em metros)
    const R = 6371000;
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLng = (p2.lng - p1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 +
              Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
              Math.sin(dLng/2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  private findNearestNode(
    position: LatLng,
    nodes: MapNode[],
    excludeId: string
  ): MapNode | null {
    let nearest: MapNode | null = null;
    let minDistance = Infinity;

    nodes.forEach(node => {
      if (node.id === excludeId) return;
      const distance = this.calculateDistance(position, node.position);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = node;
      }
    });

    return nearest;
  }

  private addToHistory(action: NodeAction): void {
    this.actionHistory.push(action);
    if (this.actionHistory.length > this.MAX_HISTORY) {
      this.actionHistory.shift();
    }
  }
}

// Classe de erro customizada para operações com nós
export class NodeValidationError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'NodeValidationError';
  }
}
```

---

## 8. Nova Funcionalidade: Edição de Nós

### 8.1 Hook de Seleção de Nós

```typescript
// client/features/map/hooks/useNodeSelection.ts

import { useState, useCallback, useEffect } from 'react';
import { useMapContext } from './useMapContext';

interface UseNodeSelectionOptions {
  onSelect?: (node: MapNode | null) => void;
  onHover?: (node: MapNode | null) => void;
  multiSelect?: boolean;
}

export function useNodeSelection(options: UseNodeSelectionOptions = {}) {
  const { nodes, setNodes, mapInstance } = useMapContext();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  /**
   * Seleciona um nó
   */
  const selectNode = useCallback((nodeId: string | null, addToSelection = false) => {
    setSelectedIds(prev => {
      const newSet = new Set(addToSelection && options.multiSelect ? prev : []);
      if (nodeId) newSet.add(nodeId);
      return newSet;
    });

    // Atualiza estado dos nós
    setNodes(prevNodes => prevNodes.map(node => ({
      ...node,
      isSelected: nodeId
        ? (options.multiSelect ? selectedIds.has(node.id) || node.id === nodeId : node.id === nodeId)
        : false,
    })));

    const selectedNode = nodeId ? nodes.find(n => n.id === nodeId) : null;
    options.onSelect?.(selectedNode ?? null);
  }, [nodes, setNodes, options, selectedIds]);

  /**
   * Limpa toda a seleção
   */
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setNodes(prevNodes => prevNodes.map(node => ({
      ...node,
      isSelected: false,
    })));
    options.onSelect?.(null);
  }, [setNodes, options]);

  /**
   * Hover em nó
   */
  const hoverNode = useCallback((nodeId: string | null) => {
    setHoveredId(nodeId);
    setNodes(prevNodes => prevNodes.map(node => ({
      ...node,
      isHovered: node.id === nodeId,
    })));

    const hoveredNode = nodeId ? nodes.find(n => n.id === nodeId) : null;
    options.onHover?.(hoveredNode ?? null);
  }, [nodes, setNodes, options]);

  /**
   * Obtém nó selecionado (primeiro se multi-select)
   */
  const getSelectedNode = useCallback((): MapNode | null => {
    const firstId = Array.from(selectedIds)[0];
    return firstId ? nodes.find(n => n.id === firstId) ?? null : null;
  }, [selectedIds, nodes]);

  /**
   * Obtém todos os nós selecionados
   */
  const getSelectedNodes = useCallback((): MapNode[] => {
    return nodes.filter(n => selectedIds.has(n.id));
  }, [selectedIds, nodes]);

  // Atalhos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC para limpar seleção
      if (e.key === 'Escape') {
        clearSelection();
      }
      // Ctrl+A para selecionar todos (se multi-select habilitado)
      if (e.key === 'a' && (e.ctrlKey || e.metaKey) && options.multiSelect) {
        e.preventDefault();
        setSelectedIds(new Set(nodes.map(n => n.id)));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection, nodes, options.multiSelect]);

  return {
    selectedIds,
    hoveredId,
    selectNode,
    clearSelection,
    hoverNode,
    getSelectedNode,
    getSelectedNodes,
    hasSelection: selectedIds.size > 0,
  };
}
```

### 8.2 Hook de Arrastar Nós

```typescript
// client/features/map/hooks/useNodeDrag.ts

import { useState, useCallback, useRef } from 'react';
import { NodesService } from '../services/NodesService';
import { useMapContext } from './useMapContext';

interface UseNodeDragOptions {
  onDragStart?: (node: MapNode) => void;
  onDragMove?: (node: MapNode, position: LatLng) => void;
  onDragEnd?: (node: MapNode, finalPosition: LatLng) => void;
  onDragCancel?: (node: MapNode) => void;
  validateOnMove?: boolean;
}

export function useNodeDrag(options: UseNodeDragOptions = {}) {
  const { nodes, setNodes, bbox, mapInstance } = useMapContext();
  const service = NodesService.getInstance();

  const [isDragging, setIsDragging] = useState(false);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<LatLng | null>(null);
  const [validation, setValidation] = useState<MoveValidationResult | null>(null);

  const originalPositionRef = useRef<LatLng | null>(null);

  /**
   * Inicia drag de um nó
   */
  const startDrag = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    originalPositionRef.current = { ...node.position };
    setIsDragging(true);
    setDraggedNodeId(nodeId);
    setDragPosition(node.position);

    // Atualiza estado do nó
    setNodes(prevNodes => prevNodes.map(n => ({
      ...n,
      isDragging: n.id === nodeId,
    })));

    // Muda cursor
    if (mapInstance) {
      mapInstance.getContainer().style.cursor = 'grabbing';
    }

    options.onDragStart?.(node);
  }, [nodes, setNodes, mapInstance, options]);

  /**
   * Atualiza posição durante drag
   */
  const updateDrag = useCallback(async (position: LatLng) => {
    if (!isDragging || !draggedNodeId) return;

    setDragPosition(position);

    // Validação em tempo real (opcional)
    if (options.validateOnMove && bbox) {
      const node = nodes.find(n => n.id === draggedNodeId);
      if (node) {
        const result = await service.validateMove(node, position, nodes, bbox);
        setValidation(result);
      }
    }

    const node = nodes.find(n => n.id === draggedNodeId);
    if (node) {
      options.onDragMove?.(node, position);
    }
  }, [isDragging, draggedNodeId, nodes, bbox, service, options]);

  /**
   * Finaliza drag e aplica movimento
   */
  const endDrag = useCallback(async () => {
    if (!isDragging || !draggedNodeId || !dragPosition || !bbox) return;

    const node = nodes.find(n => n.id === draggedNodeId);
    if (!node) return;

    // Valida movimento final
    const validationResult = await service.validateMove(node, dragPosition, nodes, bbox);

    if (!validationResult.valid) {
      // Cancela e retorna à posição original
      cancelDrag();
      return;
    }

    // Aplica movimento
    const { nodes: updatedNodes } = service.moveNode(nodes, draggedNodeId, dragPosition);
    setNodes(updatedNodes);

    // Reset estado
    setIsDragging(false);
    setDraggedNodeId(null);
    setDragPosition(null);
    setValidation(null);
    originalPositionRef.current = null;

    // Reset cursor
    if (mapInstance) {
      mapInstance.getContainer().style.cursor = '';
    }

    options.onDragEnd?.(node, dragPosition);
  }, [isDragging, draggedNodeId, dragPosition, nodes, bbox, service, setNodes, mapInstance, options]);

  /**
   * Cancela drag e retorna à posição original
   */
  const cancelDrag = useCallback(() => {
    if (!isDragging || !draggedNodeId) return;

    const node = nodes.find(n => n.id === draggedNodeId);

    // Reset estado dos nós
    setNodes(prevNodes => prevNodes.map(n => ({
      ...n,
      isDragging: false,
    })));

    setIsDragging(false);
    setDraggedNodeId(null);
    setDragPosition(null);
    setValidation(null);
    originalPositionRef.current = null;

    // Reset cursor
    if (mapInstance) {
      mapInstance.getContainer().style.cursor = '';
    }

    if (node) {
      options.onDragCancel?.(node);
    }
  }, [isDragging, draggedNodeId, nodes, setNodes, mapInstance, options]);

  return {
    isDragging,
    draggedNodeId,
    dragPosition,
    validation,
    startDrag,
    updateDrag,
    endDrag,
    cancelDrag,
  };
}
```

### 8.3 Componente de Camada de Nós

```typescript
// client/features/map/components/NodesLayer.tsx

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMapContext } from '../hooks/useMapContext';
import { useNodeSelection } from '../hooks/useNodeSelection';
import { useNodeDrag } from '../hooks/useNodeDrag';
import { NODE_STYLES } from '../constants/map.constants';

interface NodesLayerProps {
  editable?: boolean;
  showElevation?: boolean;
  onNodeClick?: (node: MapNode) => void;
}

export function NodesLayer({
  editable = false,
  showElevation = true,
  onNodeClick
}: NodesLayerProps) {
  const { mapInstance, nodes, viewMode } = useMapContext();
  const { selectNode, hoveredId, hoverNode, selectedIds } = useNodeSelection();
  const { isDragging, startDrag, updateDrag, endDrag, cancelDrag, dragPosition } = useNodeDrag({
    validateOnMove: true,
  });

  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());

  // Cria/atualiza camada de nós
  useEffect(() => {
    if (!mapInstance) return;

    // Remove camada anterior
    if (layerRef.current) {
      layerRef.current.remove();
    }

    // Cria nova camada
    layerRef.current = L.layerGroup().addTo(mapInstance);
    markersRef.current.clear();

    // Adiciona marcadores para cada nó
    nodes.forEach(node => {
      const isSelected = selectedIds.has(node.id);
      const isHovered = node.id === hoveredId;
      const isBeingDragged = node.isDragging;

      // Determina posição (usa posição de drag se estiver arrastando)
      const position = isBeingDragged && dragPosition
        ? dragPosition
        : node.position;

      // Determina estilo
      const style = getNodeStyle(node, isSelected, isHovered, isBeingDragged);

      const marker = L.circleMarker([position.lat, position.lng], style);

      // Tooltip com elevação
      if (showElevation && node.elevation !== null) {
        marker.bindTooltip(`${node.elevation.toFixed(1)}m`, {
          permanent: false,
          direction: 'top',
          offset: [0, -10],
        });
      }

      // Event handlers
      if (editable) {
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          selectNode(node.id, e.originalEvent.shiftKey);
          onNodeClick?.(node);
        });

        marker.on('mouseover', () => hoverNode(node.id));
        marker.on('mouseout', () => hoverNode(null));

        // Drag handlers (só inicia se já está selecionado)
        marker.on('mousedown', (e) => {
          if (isSelected) {
            L.DomEvent.stopPropagation(e);
            startDrag(node.id);
          }
        });
      }

      marker.addTo(layerRef.current!);
      markersRef.current.set(node.id, marker);
    });

    // Cleanup
    return () => {
      layerRef.current?.remove();
    };
  }, [mapInstance, nodes, selectedIds, hoveredId, dragPosition, editable, showElevation]);

  // Drag handlers globais no mapa
  useEffect(() => {
    if (!mapInstance || !editable) return;

    const handleMouseMove = (e: L.LeafletMouseEvent) => {
      if (isDragging) {
        updateDrag(e.latlng);
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        endDrag();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDragging) {
        cancelDrag();
      }
    };

    mapInstance.on('mousemove', handleMouseMove);
    mapInstance.on('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      mapInstance.off('mousemove', handleMouseMove);
      mapInstance.off('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mapInstance, isDragging, editable, updateDrag, endDrag, cancelDrag]);

  return null; // Renderização é feita via Leaflet
}

// Função auxiliar para determinar estilo do nó
function getNodeStyle(
  node: MapNode,
  isSelected: boolean,
  isHovered: boolean,
  isDragging: boolean
): L.CircleMarkerOptions {
  let color = NODE_STYLES.default.color;
  let radius = NODE_STYLES.default.radius;
  let fillOpacity = NODE_STYLES.default.fillOpacity;

  if (node.isEndpoint) {
    color = NODE_STYLES.endpoint.color;
  }

  if (isHovered) {
    color = NODE_STYLES.hovered.color;
    radius = NODE_STYLES.hovered.radius;
  }

  if (isSelected) {
    color = NODE_STYLES.selected.color;
    radius = NODE_STYLES.selected.radius;
    fillOpacity = NODE_STYLES.selected.fillOpacity;
  }

  if (isDragging) {
    color = NODE_STYLES.dragging.color;
    radius = NODE_STYLES.dragging.radius;
    fillOpacity = NODE_STYLES.dragging.fillOpacity;
  }

  return {
    radius,
    color,
    fillColor: color,
    fillOpacity,
    weight: 2,
  };
}
```

### 8.4 Componente Editor de Nó

```typescript
// client/features/map/components/NodeEditor.tsx

import { useCallback } from 'react';
import { useMapContext } from '../hooks/useMapContext';
import { useNodeSelection } from '../hooks/useNodeSelection';
import { NodesService, NodeValidationError } from '../services/NodesService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, Move, Undo, X } from 'lucide-react';

export function NodeEditor() {
  const { nodes, setNodes, nodeEditMode, setNodeEditMode } = useMapContext();
  const { getSelectedNode, clearSelection, hasSelection } = useNodeSelection();
  const service = NodesService.getInstance();

  const selectedNode = getSelectedNode();

  /**
   * Deleta nó selecionado
   */
  const handleDelete = useCallback(() => {
    if (!selectedNode) return;

    try {
      const { nodes: updatedNodes } = service.deleteNode(nodes, selectedNode.id);
      setNodes(updatedNodes);
      clearSelection();
    } catch (error) {
      if (error instanceof NodeValidationError) {
        // Mostra toast de erro
        console.error(error.message);
      }
    }
  }, [selectedNode, nodes, service, setNodes, clearSelection]);

  /**
   * Desfaz última ação
   */
  const handleUndo = useCallback(() => {
    const { nodes: updatedNodes, undoneAction } = service.undo(nodes);
    if (undoneAction) {
      setNodes(updatedNodes);
    }
  }, [nodes, service, setNodes]);

  /**
   * Ativa modo de movimentação
   */
  const handleEnterMoveMode = useCallback(() => {
    setNodeEditMode('move');
  }, [setNodeEditMode]);

  // Estado vazio - instrução para usuário
  if (!hasSelection || !selectedNode) {
    return (
      <Card className="w-64">
        <CardContent className="p-4 text-center text-muted-foreground">
          Clique em um nó para selecioná-lo
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-64">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Editar Nó</CardTitle>
          <Button variant="ghost" size="icon" onClick={clearSelection}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Informações do nó */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Latitude:</span>
            <span className="font-mono">{selectedNode.position.lat.toFixed(6)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Longitude:</span>
            <span className="font-mono">{selectedNode.position.lng.toFixed(6)}</span>
          </div>
          {selectedNode.elevation !== null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Elevação:</span>
              <span className="font-mono">{selectedNode.elevation.toFixed(1)}m</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Tipo:</span>
            <Badge variant={selectedNode.isEndpoint ? 'secondary' : 'outline'}>
              {selectedNode.isEndpoint ? 'Endpoint' : 'Intermediário'}
            </Badge>
          </div>
        </div>

        {/* Ações */}
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={handleEnterMoveMode}
          >
            <Move className="h-4 w-4 mr-2" />
            Mover nó
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={selectedNode.isEndpoint}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Deletar nó
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={handleUndo}
          >
            <Undo className="h-4 w-4 mr-2" />
            Desfazer (Ctrl+Z)
          </Button>
        </div>

        {/* Aviso para endpoints */}
        {selectedNode.isEndpoint && (
          <p className="text-xs text-muted-foreground">
            Endpoints não podem ser deletados pois são necessários para definir a geometria da rua.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

### 8.5 Constantes de Estilo de Nós

```typescript
// client/features/map/constants/map.constants.ts

// ============ ESTILOS DE NÓS ============

export const NODE_STYLES = {
  default: {
    color: '#6b7280',      // gray-500
    radius: 4,
    fillOpacity: 0.8,
  },
  endpoint: {
    color: '#f59e0b',      // amber-500
    radius: 5,
    fillOpacity: 0.9,
  },
  selected: {
    color: '#3b82f6',      // blue-500
    radius: 7,
    fillOpacity: 1,
  },
  hovered: {
    color: '#8b5cf6',      // violet-500
    radius: 6,
    fillOpacity: 0.9,
  },
  dragging: {
    color: '#22c55e',      // green-500
    radius: 8,
    fillOpacity: 0.7,
  },
  invalid: {
    color: '#ef4444',      // red-500
    radius: 7,
    fillOpacity: 0.8,
  },
} as const;

// ============ RESTRIÇÕES DE NÓS ============

export const NODE_CONSTRAINTS = {
  MIN_DISTANCE_METERS: 1,        // Distância mínima entre nós
  MAX_MOVE_DISTANCE_METERS: 500, // Distância máxima de movimento único
  SNAP_DISTANCE_METERS: 5,       // Distância para snap automático
} as const;

// ============ ESTILOS DE BOUNDING BOX ============

export const BBOX_COLORS = {
  valid: '#3b82f6',      // blue-500
  invalid: '#ef4444',    // red-500
  confirmed: '#22c55e',  // green-500
} as const;

// ============ LIMITES DE ÁREA ============

export const AREA_LIMITS = {
  MAX_BBOX_AREA_KM2: 100,
  MIN_BBOX_AREA_KM2: 0.001,
  BBOX_AREA_WARNING_THRESHOLD: 50,
} as const;

// ============ CORES DE HIGHWAY ============

export const HIGHWAY_COLORS: Record<string, string> = {
  motorway: '#e11d48',     // red
  trunk: '#f97316',        // orange
  primary: '#eab308',      // yellow
  secondary: '#22c55e',    // green
  tertiary: '#3b82f6',     // blue
  residential: '#8b5cf6',  // purple
  unclassified: '#6b7280', // gray
  default: '#6b7280',      // gray
} as const;

export const HIGHWAY_WEIGHTS: Record<string, number> = {
  motorway: 4,
  trunk: 4,
  primary: 3,
  secondary: 3,
  tertiary: 2,
  residential: 2,
  unclassified: 2,
  default: 2,
} as const;
```

---

## 9. Segurança e Validação

### 9.1 Camada de Validação Unificada

```typescript
// client/lib/geo/validations.ts

/**
 * Validações geoespaciais compartilhadas entre frontend e backend
 */
export const GeoValidations = {
  /**
   * Valida se coordenada é número finito válido
   */
  isValidCoordinate(value: unknown): value is number {
    return typeof value === 'number' && isFinite(value) && !isNaN(value);
  },

  /**
   * Valida latitude (-90 a 90)
   */
  isValidLatitude(lat: number): boolean {
    return this.isValidCoordinate(lat) && lat >= -90 && lat <= 90;
  },

  /**
   * Valida longitude (-180 a 180)
   */
  isValidLongitude(lng: number): boolean {
    return this.isValidCoordinate(lng) && lng >= -180 && lng <= 180;
  },

  /**
   * Valida objeto LatLng completo
   */
  isValidLatLng(latlng: unknown): latlng is LatLng {
    if (!latlng || typeof latlng !== 'object') return false;
    const ll = latlng as Record<string, unknown>;
    return this.isValidLatitude(ll.lat as number) &&
           this.isValidLongitude(ll.lng as number);
  },

  /**
   * Sanitiza latitude para range válido
   */
  clampLatitude(lat: number): number {
    return Math.max(-90, Math.min(90, lat));
  },

  /**
   * Sanitiza longitude para range válido
   */
  clampLongitude(lng: number): number {
    return Math.max(-180, Math.min(180, lng));
  },

  /**
   * Valida estrutura GeoJSON básica
   */
  isValidGeoJSON(data: unknown): data is GeoJSON.FeatureCollection {
    if (!data || typeof data !== 'object') return false;
    const geo = data as Record<string, unknown>;
    return geo.type === 'FeatureCollection' && Array.isArray(geo.features);
  },

  /**
   * Sanitiza GeoJSON removendo features inválidas
   */
  sanitizeGeoJSON(data: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
    return {
      ...data,
      features: data.features.filter(feature => {
        if (!feature.geometry) return false;
        if (feature.geometry.type === 'LineString') {
          const coords = feature.geometry.coordinates;
          return Array.isArray(coords) && coords.length >= 2 &&
                 coords.every(c => Array.isArray(c) && c.length >= 2 &&
                   this.isValidLongitude(c[0]) && this.isValidLatitude(c[1]));
        }
        return true;
      }),
    };
  },
};
```

### 9.2 Validação de API

```typescript
// client/app/api/geo/validate-bbox/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { GeoValidations } from '@/lib/geo/validations';
import { GeoCalculations } from '@/lib/geo/calculations';

const MAX_AREA_KM2 = 100;
const MIN_AREA_KM2 = 0.001;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { south, west, north, east } = body;

    const errors: string[] = [];

    // Validação de tipos
    if (!GeoValidations.isValidLatitude(south)) {
      errors.push('Latitude sul inválida');
    }
    if (!GeoValidations.isValidLatitude(north)) {
      errors.push('Latitude norte inválida');
    }
    if (!GeoValidations.isValidLongitude(west)) {
      errors.push('Longitude oeste inválida');
    }
    if (!GeoValidations.isValidLongitude(east)) {
      errors.push('Longitude leste inválida');
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { valid: false, errors },
        { status: 400 }
      );
    }

    // Validação de ordem
    if (south >= north) {
      errors.push('Latitude sul deve ser menor que latitude norte');
    }
    if (west >= east) {
      errors.push('Longitude oeste deve ser menor que longitude leste');
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { valid: false, errors },
        { status: 400 }
      );
    }

    // Cálculo de área
    const bbox = {
      southWest: { lat: south, lng: west },
      northEast: { lat: north, lng: east },
    };
    const area = GeoCalculations.calculateArea(bbox);

    // Validação de área
    if (area > MAX_AREA_KM2) {
      errors.push(`Área (${area.toFixed(2)} km²) excede limite de ${MAX_AREA_KM2} km²`);
    }
    if (area < MIN_AREA_KM2) {
      errors.push(`Área (${area.toFixed(4)} km²) menor que mínimo de ${MIN_AREA_KM2} km²`);
    }

    return NextResponse.json({
      valid: errors.length === 0,
      errors,
      metadata: {
        area,
        center: GeoCalculations.getCenter(bbox),
      },
    });

  } catch (error) {
    return NextResponse.json(
      { valid: false, errors: ['Erro ao processar requisição'] },
      { status: 500 }
    );
  }
}
```

### 9.3 Rate Limiting

```typescript
// client/lib/api/rate-limiter.ts

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  constructor(private config: RateLimitConfig) {}

  /**
   * Verifica se requisição pode prosseguir
   */
  canProceed(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    const timestamps = this.requests.get(key) || [];
    const recent = timestamps.filter(t => t > windowStart);

    if (recent.length >= this.config.maxRequests) {
      return false;
    }

    recent.push(now);
    this.requests.set(key, recent);
    return true;
  }

  /**
   * Retorna tempo de espera em ms até próxima requisição permitida
   */
  getWaitTime(key: string): number {
    const timestamps = this.requests.get(key) || [];
    if (timestamps.length === 0) return 0;

    const oldest = Math.min(...timestamps);
    const waitUntil = oldest + this.config.windowMs;
    return Math.max(0, waitUntil - Date.now());
  }
}

// Instâncias para diferentes endpoints
export const streetsFetchLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60000, // 10 req/min
});

export const topographyFetchLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 60000, // 5 req/min
});

export const nodeOperationsLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000, // 100 ops/min
});
```

---

## 10. API e Contratos de Dados

### 10.1 Schemas de Request/Response

```typescript
// client/types/api.types.ts

/**
 * Request para buscar ruas
 */
export interface StreetsRequest {
  south: number;
  west: number;
  north: number;
  east: number;
  types?: HighwayType[];
}

/**
 * Response de ruas
 */
export interface StreetsResponse {
  type: 'FeatureCollection';
  features: StreetFeature[];
  metadata: {
    totalStreets: number;
    areaKm2: number;
    bounds: {
      south: number;
      west: number;
      north: number;
      east: number;
    };
    fetchedAt: string;
  };
}

/**
 * Request para topografia
 */
export interface TopographyRequest {
  south: number;
  west: number;
  north: number;
  east: number;
  demType?: DEMType;
  outputFormat?: 'GTiff' | 'AAIGrid';
}

/**
 * Request para salvar projeto
 */
export interface SaveProjectRequest {
  id: string;
  name: string;
  bounds: BoundingBox;
  areaKm2: number;
  center: [number, number];
  zoom: number;
  stats: {
    streetCount: number;
  };
  streets: GeoJSON.FeatureCollection;
  nodes?: MapNode[]; // Nós editados (NOVO)
}

/**
 * Response de erro padronizada
 */
export interface APIErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
}
```

### 10.2 API de Nós

```typescript
// client/app/api/geo/nodes/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { GeoValidations } from '@/lib/geo/validations';

/**
 * POST /api/geo/nodes
 * Salva nós editados de um projeto
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, nodes } = body;

    // Validações
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json(
        { error: { code: 'INVALID_PROJECT_ID', message: 'ID do projeto inválido' } },
        { status: 400 }
      );
    }

    if (!Array.isArray(nodes)) {
      return NextResponse.json(
        { error: { code: 'INVALID_NODES', message: 'Nós devem ser um array' } },
        { status: 400 }
      );
    }

    // Valida cada nó
    const invalidNodes = nodes.filter((node) => {
      if (!node.id || !node.position) return true;
      if (!GeoValidations.isValidLatLng(node.position)) return true;
      return false;
    });

    if (invalidNodes.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_NODE_DATA',
            message: `${invalidNodes.length} nó(s) com dados inválidos`
          }
        },
        { status: 400 }
      );
    }

    // Salva no backend
    const response = await fetch(`${process.env.API_URL}/projects/${projectId}/nodes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes }),
    });

    if (!response.ok) {
      throw new Error('Falha ao salvar nós no backend');
    }

    return NextResponse.json({
      success: true,
      savedCount: nodes.length
    });

  } catch (error) {
    console.error('Erro ao salvar nós:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' } },
      { status: 500 }
    );
  }
}
```

---

## 11. Plano de Implementação

### 11.1 Fases de Implementação

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        FASE 1: FUNDAÇÃO (2 sprints)                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Sprint 1:                                                               │
│  ├─ [ ] Criar estrutura de pastas /features/map                         │
│  ├─ [ ] Extrair GeoCalculations para /lib/geo                           │
│  ├─ [ ] Extrair GeoValidations para /lib/geo                            │
│  ├─ [ ] Criar tipos em /features/map/types                              │
│  └─ [ ] Criar constantes unificadas                                     │
│                                                                          │
│  Sprint 2:                                                               │
│  ├─ [ ] Implementar BoundingBoxService                                  │
│  ├─ [ ] Implementar BboxValidator                                       │
│  ├─ [ ] Refatorar useBoundingBox hook                                   │
│  └─ [ ] Criar endpoint /api/geo/validate-bbox                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      FASE 2: ELEVAÇÃO (1 sprint)                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Sprint 3:                                                               │
│  ├─ [ ] Implementar ElevationService com cache                          │
│  ├─ [ ] Criar ElevationError class                                      │
│  ├─ [ ] Refatorar useElevation hook                                     │
│  ├─ [ ] Adicionar validação de GeoTIFF                                  │
│  └─ [ ] Testes de integração para elevação                              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                       FASE 3: NÓS (2 sprints)                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Sprint 4:                                                               │
│  ├─ [ ] Criar tipos de nó (node.types.ts)                               │
│  ├─ [ ] Implementar NodesService                                        │
│  ├─ [ ] Implementar NodeValidator                                       │
│  ├─ [ ] Criar useNodes hook                                             │
│  └─ [ ] Criar useNodeSelection hook                                     │
│                                                                          │
│  Sprint 5:                                                               │
│  ├─ [ ] Implementar useNodeDrag hook                                    │
│  ├─ [ ] Criar NodesLayer component                                      │
│  ├─ [ ] Criar NodeEditor component                                      │
│  ├─ [ ] Implementar undo/redo                                           │
│  └─ [ ] Testes E2E de edição de nós                                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                     FASE 4: INTEGRAÇÃO (1 sprint)                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Sprint 6:                                                               │
│  ├─ [ ] Criar MapContext provider                                       │
│  ├─ [ ] Refatorar Map.tsx para usar context                             │
│  ├─ [ ] Integrar NodesLayer no MapContainer                             │
│  ├─ [ ] Atualizar fluxo de salvamento de projeto                        │
│  ├─ [ ] Adicionar endpoint /api/geo/nodes                               │
│  └─ [ ] Documentação de uso                                             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      FASE 5: POLIMENTO (1 sprint)                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Sprint 7:                                                               │
│  ├─ [ ] Adicionar rate limiting                                         │
│  ├─ [ ] Melhorar feedback visual                                        │
│  ├─ [ ] Adicionar tooltips e ajuda                                      │
│  ├─ [ ] Otimizar performance (memoization)                              │
│  ├─ [ ] Remover código legado não utilizado                             │
│  └─ [ ] Testes de regressão completos                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Checklist de Migração

```markdown
## Checklist de Migração

### Arquivos a Criar
- [ ] `/client/features/map/` (estrutura completa)
- [ ] `/client/lib/geo/calculations.ts`
- [ ] `/client/lib/geo/validations.ts`
- [ ] `/client/lib/geo/projections.ts`
- [ ] `/client/app/api/geo/validate-bbox/route.ts`
- [ ] `/client/app/api/geo/nodes/route.ts`

### Arquivos a Refatorar
- [ ] `/client/components/Map.tsx` → dividir em componentes menores
- [ ] `/client/hooks/useMapInstance.ts` → mover para features/map
- [ ] `/client/hooks/useBoundingBoxDrawing.ts` → refatorar como useBoundingBox
- [ ] `/client/hooks/useDataProcessing.ts` → integrar com novos serviços
- [ ] `/client/utils/elevation.ts` → mover para ElevationService
- [ ] `/client/app/api/streets/route.ts` → mover para /api/geo/streets
- [ ] `/client/app/api/topography/route.ts` → mover para /api/geo/topography

### Arquivos a Remover
- [ ] `/client/components/ProcessingModal.tsx` (não utilizado)
- [ ] `/client/components/TopographyPanel.tsx` (não integrado)

### Variáveis de Ambiente
- [ ] Verificar OPENTOPOGRAPHY_API_KEY
- [ ] Adicionar RATE_LIMIT_ENABLED (opcional)
```

### 11.3 Critérios de Aceitação

| Funcionalidade | Critério | Prioridade |
|----------------|----------|------------|
| Seleção de Bbox | Validação em tempo real com feedback visual | Alta |
| Seleção de Bbox | Área calculada corretamente (< 1% erro) | Alta |
| Elevação | Cache funcional com TTL de 30min | Média |
| Elevação | Fallback gracioso se API falhar | Alta |
| Seleção de Nó | Click seleciona, Shift+Click multi-select | Alta |
| Movimento de Nó | Drag smooth com preview em tempo real | Alta |
| Movimento de Nó | Validação impede movimento fora do bbox | Alta |
| Deleção de Nó | Não permite deletar endpoints | Alta |
| Undo | Restaura estado anterior corretamente | Média |
| Performance | < 100ms para seleção/hover de nó | Média |
| Performance | < 500ms para carregar 1000 nós | Média |

---

## 12. Testes

### 12.1 Testes Unitários

```typescript
// __tests__/features/map/services/BoundingBoxService.test.ts

import { BoundingBoxService } from '@/features/map/services/BoundingBoxService';

describe('BoundingBoxService', () => {
  const service = BoundingBoxService.getInstance();

  describe('createFromPoints', () => {
    it('deve criar bbox com coordenadas ordenadas corretamente', () => {
      const start = { lat: -23.55, lng: -46.63 };
      const end = { lat: -23.50, lng: -46.60 };

      const bbox = service.createFromPoints(start, end);

      expect(bbox.southWest.lat).toBeLessThan(bbox.northEast.lat);
      expect(bbox.southWest.lng).toBeLessThan(bbox.northEast.lng);
    });

    it('deve funcionar com pontos em qualquer ordem', () => {
      const start = { lat: -23.50, lng: -46.60 };
      const end = { lat: -23.55, lng: -46.63 };

      const bbox = service.createFromPoints(start, end);

      expect(bbox.southWest).toEqual({ lat: -23.55, lng: -46.63 });
      expect(bbox.northEast).toEqual({ lat: -23.50, lng: -46.60 });
    });
  });

  describe('validate', () => {
    it('deve rejeitar área maior que 100 km²', async () => {
      const largeBbox = {
        southWest: { lat: -24, lng: -47 },
        northEast: { lat: -23, lng: -46 },
      };

      const result = await service.validate(largeBbox);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'AREA_TOO_LARGE' })
      );
    });

    it('deve aceitar área válida', async () => {
      const validBbox = {
        southWest: { lat: -23.56, lng: -46.64 },
        northEast: { lat: -23.54, lng: -46.62 },
      };

      const result = await service.validate(validBbox);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
```

```typescript
// __tests__/features/map/services/NodesService.test.ts

import { NodesService, NodeValidationError } from '@/features/map/services/NodesService';

describe('NodesService', () => {
  const service = NodesService.getInstance();

  describe('moveNode', () => {
    it('deve mover nó para nova posição', () => {
      const nodes: MapNode[] = [
        {
          id: 'node-1',
          position: { lat: -23.55, lng: -46.63 },
          elevation: 750,
          streetId: 'street-1',
          vertexIndex: 0,
          isEndpoint: true,
          isSelected: false,
          isHovered: false,
          isDragging: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const newPosition = { lat: -23.54, lng: -46.62 };
      const { nodes: updated, action } = service.moveNode(nodes, 'node-1', newPosition);

      expect(updated[0].position).toEqual(newPosition);
      expect(action.type).toBe('move');
      expect(action.previousState.position).toEqual({ lat: -23.55, lng: -46.63 });
    });
  });

  describe('deleteNode', () => {
    it('não deve permitir deletar endpoint', () => {
      const nodes: MapNode[] = [
        {
          id: 'node-1',
          position: { lat: -23.55, lng: -46.63 },
          elevation: 750,
          streetId: 'street-1',
          vertexIndex: 0,
          isEndpoint: true,
          isSelected: false,
          isHovered: false,
          isDragging: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      expect(() => service.deleteNode(nodes, 'node-1')).toThrow(NodeValidationError);
    });

    it('deve deletar nó intermediário', () => {
      const nodes: MapNode[] = [
        {
          id: 'node-1',
          position: { lat: -23.55, lng: -46.63 },
          elevation: 750,
          streetId: 'street-1',
          vertexIndex: 1,
          isEndpoint: false,
          isSelected: false,
          isHovered: false,
          isDragging: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const { nodes: updated } = service.deleteNode(nodes, 'node-1');

      expect(updated).toHaveLength(0);
    });
  });

  describe('undo', () => {
    it('deve desfazer movimento', () => {
      const originalPosition = { lat: -23.55, lng: -46.63 };
      const nodes: MapNode[] = [
        {
          id: 'node-1',
          position: originalPosition,
          elevation: 750,
          streetId: 'street-1',
          vertexIndex: 0,
          isEndpoint: true,
          isSelected: false,
          isHovered: false,
          isDragging: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      // Move
      const { nodes: movedNodes } = service.moveNode(nodes, 'node-1', { lat: -23.54, lng: -46.62 });

      // Undo
      const { nodes: undoneNodes, undoneAction } = service.undo(movedNodes);

      expect(undoneNodes[0].position).toEqual(originalPosition);
      expect(undoneAction?.type).toBe('move');
    });
  });
});
```

### 12.2 Testes de Integração

```typescript
// __tests__/integration/map-flow.test.ts

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MapContainer } from '@/features/map/components/MapContainer';
import { MapProvider } from '@/features/map/context/MapContext';

describe('Map Integration Flow', () => {
  it('deve completar fluxo de seleção de área', async () => {
    render(
      <MapProvider>
        <MapContainer />
      </MapProvider>
    );

    // 1. Inicia seleção
    const map = screen.getByTestId('map-canvas');

    // Simula Shift + Drag
    fireEvent.mouseDown(map, { shiftKey: true, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(map, { shiftKey: true, clientX: 200, clientY: 200 });
    fireEvent.mouseUp(map);

    // 2. Verifica feedback visual
    await waitFor(() => {
      expect(screen.getByText(/km²/)).toBeInTheDocument();
    });

    // 3. Confirma seleção
    fireEvent.click(screen.getByText('Confirmar'));

    // 4. Verifica modo cropped
    await waitFor(() => {
      expect(screen.getByText('Buscar Dados')).toBeInTheDocument();
    });
  });

  it('deve permitir edição de nós após carregar dados', async () => {
    render(
      <MapProvider initialNodes={mockNodes}>
        <MapContainer editable />
      </MapProvider>
    );

    // 1. Seleciona nó
    const node = screen.getByTestId('node-1');
    fireEvent.click(node);

    // 2. Verifica painel de edição
    await waitFor(() => {
      expect(screen.getByText('Editar Nó')).toBeInTheDocument();
    });

    // 3. Move nó
    fireEvent.mouseDown(node);
    fireEvent.mouseMove(document, { clientX: 150, clientY: 150 });
    fireEvent.mouseUp(document);

    // 4. Verifica atualização
    await waitFor(() => {
      const updatedNode = screen.getByTestId('node-1');
      expect(updatedNode).toBeInTheDocument();
    });
  });
});
```

### 12.3 Testes E2E (Playwright)

```typescript
// e2e/map-editing.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Edição de Mapa', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('deve criar projeto com área selecionada', async ({ page }) => {
    // Seleciona área
    await page.locator('#map').hover();
    await page.keyboard.down('Shift');
    await page.mouse.down();
    await page.mouse.move(200, 200);
    await page.mouse.up();
    await page.keyboard.up('Shift');

    // Confirma
    await page.click('text=Confirmar');

    // Busca dados
    await page.click('text=Buscar Dados');
    await expect(page.locator('text=ruas encontradas')).toBeVisible({ timeout: 30000 });

    // Salva projeto
    await page.click('text=Salvar Projeto');
    await page.fill('input[name="projectName"]', 'Teste E2E');
    await page.click('text=Salvar');

    // Verifica redirecionamento
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.locator('text=Teste E2E')).toBeVisible();
  });

  test('deve editar nó em projeto existente', async ({ page }) => {
    // Navega para projeto
    await page.goto('/projects/test-project-id');

    // Ativa modo de edição
    await page.click('text=Editar');

    // Seleciona nó
    await page.locator('.node-marker').first().click();

    // Verifica painel
    await expect(page.locator('text=Editar Nó')).toBeVisible();

    // Move nó (drag)
    const node = page.locator('.node-marker.selected');
    await node.dragTo(page.locator('#map'), { targetPosition: { x: 300, y: 300 } });

    // Salva alterações
    await page.click('text=Salvar Alterações');

    // Verifica persistência
    await page.reload();
  });

  test('deve desfazer edição com Ctrl+Z', async ({ page }) => {
    await page.goto('/projects/test-project-id');
    await page.click('text=Editar');

    // Seleciona e deleta nó
    await page.locator('.node-marker:not(.endpoint)').first().click();
    await page.click('text=Deletar nó');

    // Verifica deleção
    const countBefore = await page.locator('.node-marker').count();

    // Undo
    await page.keyboard.press('Control+z');

    // Verifica restauração
    const countAfter = await page.locator('.node-marker').count();
    expect(countAfter).toBe(countBefore + 1);
  });
});
```

---

## Apêndice A: Glossário

| Termo | Definição |
|-------|-----------|
| **Bbox** | Bounding Box - retângulo definido por coordenadas SW e NE |
| **DEM** | Digital Elevation Model - modelo digital de elevação |
| **GeoJSON** | Formato padrão para dados geoespaciais em JSON |
| **GeoTIFF** | Formato de imagem com metadados geoespaciais |
| **Nó** | Vértice de uma geometria LineString (ponto em uma rua) |
| **Endpoint** | Nó que é início ou fim de uma rua |
| **Overpass** | API para consultar dados do OpenStreetMap |
| **Snap** | Alinhamento automático a pontos próximos |

## Apêndice B: Atalhos de Teclado

| Atalho | Ação |
|--------|------|
| `Shift + Drag` | Desenhar seleção de área |
| `Escape` | Cancelar operação / Limpar seleção |
| `Ctrl + Z` | Desfazer última ação |
| `Ctrl + A` | Selecionar todos os nós (se habilitado) |
| `Delete` | Deletar nó selecionado |

## Apêndice C: Referências

- [Leaflet Documentation](https://leafletjs.com/reference.html)
- [GeoJSON Specification (RFC 7946)](https://geojson.org/)
- [OpenTopography API](https://opentopography.org/developers)
- [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [React Query Documentation](https://tanstack.com/query/latest)
- [Zustand Documentation](https://zustand-demo.pmnd.rs/)

---

**Documento mantido por:** Equipe de Desenvolvimento URBANUS
**Última atualização:** Janeiro 2026
