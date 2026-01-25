# Otimizações Adicionais — URBANUS

Este documento identifica oportunidades de otimização adicionais após a migração de GeoTIFF e elevação para o servidor Python.

---

## 1. Cache de Elevação no Servidor Python

### Problema
Cada requisição de elevação faz fetch do GeoTIFF do OpenTopography, mesmo para bboxes idênticos ou sobrepostos.

### Solução
Implementar cache em memória (ou Redis) no servidor Python para resultados de elevação por bbox.

**Benefícios:**
- Reduz chamadas à API do OpenTopography
- Respostas mais rápidas para bboxes já processados
- Economia de banda e custos

**Implementação:**
```python
# server/elevation.py
from functools import lru_cache
from typing import Tuple
import hashlib

# Cache simples em memória (ou usar Redis para produção)
_elevation_cache: dict[str, dict] = {}
CACHE_TTL = 3600  # 1 hora

def _cache_key(south: float, north: float, west: float, east: float, dem_type: str) -> str:
    """Gera chave de cache baseada em bbox + dem_type"""
    key_str = f"{south:.4f},{north:.4f},{west:.4f},{east:.4f},{dem_type}"
    return hashlib.md5(key_str.encode()).hexdigest()

def enrich_geojson(...):
    cache_key = _cache_key(south, north, west, east, dem_type)
    
    # Verifica cache
    if cache_key in _elevation_cache:
        cached = _elevation_cache[cache_key]
        if time.time() - cached['timestamp'] < CACHE_TTL:
            return cached['result']
    
    # Processa normalmente
    result = _process_elevation(...)
    
    # Salva no cache
    _elevation_cache[cache_key] = {
        'result': result,
        'timestamp': time.time()
    }
    
    return result
```

**Impacto:** Alto — Reduz latência e custos de API externa.

---

## 2. Processamento de Grafo no Servidor

### Problema
O `GraphProcessorService` roda no cliente, processando grafos grandes no browser (single-threaded).

### Solução
Mover processamento de grafo para o servidor Python usando `networkx` e `shapely`.

**Benefícios:**
- Processamento paralelo no servidor
- Melhor performance para grafos grandes
- Libera CPU do browser

**Implementação:**
```python
# server/graph.py
import networkx as nx
from shapely.geometry import LineString, Point

def process_graph(
    nodes: list[dict],
    max_edge_length: float,
    preserve_elevations: bool = True
) -> dict:
    """
    Processa grafo subdividindo arestas que excedem max_edge_length.
    Retorna nós processados + estatísticas.
    """
    # Criar grafo direcionado
    G = nx.DiGraph()
    
    # Adicionar nós
    for node in nodes:
        G.add_node(node['id'], **node)
    
    # Agrupar por streetId e criar arestas
    nodes_by_street = {}
    for node in nodes:
        street_id = node['streetId']
        if street_id not in nodes_by_street:
            nodes_by_street[street_id] = []
        nodes_by_street[street_id].append(node)
    
    # Processar cada rua
    new_nodes = []
    processed_edges = 0
    
    for street_id, street_nodes in nodes_by_street.items():
        street_nodes.sort(key=lambda n: n['vertexIndex'])
        
        for i in range(len(street_nodes) - 1):
            start = street_nodes[i]
            end = street_nodes[i + 1]
            
            # Calcular distância (Haversine)
            distance = _haversine_distance(
                start['position']['lat'], start['position']['lng'],
                end['position']['lat'], end['position']['lng']
            )
            
            if distance > max_edge_length:
                # Subdividir
                num_intermediates = int(distance / max_edge_length)
                # ... criar nós intermediários ...
                processed_edges += 1
    
    return {
        'nodes': new_nodes,
        'stats': {
            'processed_edges': processed_edges,
            'new_nodes': len(new_nodes) - len(nodes)
        }
    }
```

**Endpoint:**
```python
# server/main.py
@app.post("/graph/process")
async def process_graph_endpoint(req: GraphProcessRequest):
    result = process_graph(
        req.nodes,
        req.max_edge_length,
        req.preserve_elevations
    )
    return result
```

**Impacto:** Médio-Alto — Melhora performance para grafos grandes (>1000 nós).

---

## 3. Otimização de Renderização Leaflet

### Problema
Muitos `CircleMarker` e `Polyline` podem causar lentidão, especialmente com muitos nós.

### Solução
Usar Canvas renderer e clustering para nós próximos.

**Implementação:**
```typescript
// client/features/map/components/OptimizedNodesLayer.tsx
import { useMap } from 'react-leaflet';
import { useEffect } from 'react';
import L from 'leaflet';

// Usar Canvas renderer para melhor performance
const useCanvasRenderer = () => {
  const map = useMap();
  
  useEffect(() => {
    // Forçar Canvas renderer
    map.getRenderer = (layer: L.Layer) => {
      return new L.Canvas({ padding: 0.5 });
    };
  }, [map]);
};

// Clustering para nós próximos
import MarkerClusterGroup from 'react-leaflet-cluster';

function NodesLayerWithClustering({ nodes, ...props }) {
  return (
    <MarkerClusterGroup
      chunkedLoading
      maxClusterRadius={50}
      spiderfyOnMaxZoom={true}
    >
      {nodes.map(node => (
        <CircleMarker key={node.id} {...props} />
      ))}
    </MarkerClusterGroup>
  );
}
```

**Impacto:** Médio — Melhora FPS com muitos nós (>500).

---

## 4. Web Workers para Processamento Pesado

### Problema
Cálculos pesados (análise de arestas, processamento de grafo) bloqueiam a UI thread.

### Solução
Mover cálculos para Web Workers.

**Implementação:**
```typescript
// client/workers/graph-processor.worker.ts
self.onmessage = (e) => {
  const { nodes, maxEdgeLength } = e.data;
  
  // Processar grafo
  const result = processGraph(nodes, maxEdgeLength);
  
  self.postMessage({ result });
};

// client/features/map/hooks/useGraphProcessing.ts
const processGraphInWorker = useCallback(async (nodes, options) => {
  const worker = new Worker(
    new URL('../../workers/graph-processor.worker.ts', import.meta.url)
  );
  
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      resolve(e.data.result);
      worker.terminate();
    };
    worker.onerror = reject;
    worker.postMessage({ nodes, maxEdgeLength: options.maxEdgeLength });
  });
}, []);
```

**Impacto:** Médio — Mantém UI responsiva durante processamento.

---

## 5. Debouncing de Operações Frequentes

### Problema
Operações como sync de elevação e atualização de estado podem ser disparadas muito frequentemente.

### Solução
Implementar debouncing para operações que não precisam ser imediatas.

**Implementação:**
```typescript
// client/features/map/hooks/useElevationSync.ts
import { useDebouncedCallback } from 'use-debounce';

export function useElevationSync(options) {
  const [pending, setPending] = useState<Set<string>>(new Set());
  
  // Debounce sync de elevação (500ms)
  const debouncedSync = useDebouncedCallback(
    async (nodeIds: string[]) => {
      // Fazer sync apenas uma vez após 500ms de inatividade
      await syncElevations(nodeIds);
    },
    500
  );
  
  const markModified = useCallback((nodeId: string) => {
    setPending(prev => new Set([...prev, nodeId]));
    debouncedSync([...pending, nodeId]);
  }, [pending, debouncedSync]);
}
```

**Impacto:** Baixo-Médio — Reduz requisições desnecessárias.

---

## 6. Otimização de Estado (Dividir MapContext)

### Problema
O `MapContext` gerencia muito estado, causando re-renders desnecessários.

### Solução
Dividir em múltiplos contextos menores ou usar Zustand para estado não-UI.

**Implementação:**
```typescript
// client/features/map/context/MapUIContext.tsx
// Apenas estado de UI (modo de visualização, dialogs, etc.)

// client/features/map/context/MapDataContext.tsx
// Apenas dados (streets, nodes, bbox)

// client/stores/useMapDataStore.ts
// Estado de dados em Zustand (não causa re-renders)
```

**Impacto:** Médio — Reduz re-renders e melhora performance.

---

## 7. Lazy Loading de Componentes

### Problema
Componentes pesados são carregados mesmo quando não usados.

### Solução
Usar `React.lazy` e `Suspense` para carregar componentes sob demanda.

**Implementação:**
```typescript
// client/app/projects/[id]/page.tsx
import { lazy, Suspense } from 'react';

const GraphProcessingPanel = lazy(() => 
  import('@/features/map/components/GraphProcessingPanel')
);

// Usar apenas quando necessário
{isGraphProcessingOpen && (
  <Suspense fallback={<div>Loading...</div>}>
    <GraphProcessingPanel ... />
  </Suspense>
)}
```

**Impacto:** Baixo-Médio — Reduz bundle inicial.

---

## 8. Virtualização de Listas

### Problema
Listas grandes de nós/ruas podem causar lentidão ao renderizar.

### Solução
Usar virtualização para renderizar apenas itens visíveis.

**Implementação:**
```typescript
// client/components/VirtualizedNodeList.tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualizedNodeList({ nodes }) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
  });
  
  return (
    <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
      {virtualizer.getVirtualItems().map(virtualItem => (
        <div key={virtualItem.key}>
          {nodes[virtualItem.index]}
        </div>
      ))}
    </div>
  );
}
```

**Impacto:** Baixo — Apenas relevante para listas muito grandes (>1000 itens).

---

## 9. Otimização de React Query

### Problema
Configuração padrão do React Query pode causar refetches desnecessários.

### Solução
Ajustar `staleTime` e `cacheTime` para diferentes tipos de dados.

**Implementação:**
```typescript
// client/components/providers.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutos
      cacheTime: 10 * 60 * 1000, // 10 minutos
      refetchOnWindowFocus: false,
    },
  },
});

// Para dados de elevação (raramente mudam)
useQuery({
  queryKey: ['elevation', bbox],
  queryFn: fetchElevation,
  staleTime: 60 * 60 * 1000, // 1 hora
  cacheTime: 24 * 60 * 60 * 1000, // 24 horas
});
```

**Impacto:** Médio — Reduz requisições desnecessárias.

---

## 10. Compressão de Payloads

### Problema
GeoJSON pode ser muito grande, aumentando tempo de transferência.

### Solução
Implementar compressão gzip no servidor e otimizar formato de dados.

**Implementação:**
```python
# server/main.py
from fastapi.middleware.gzip import GZipMiddleware

app.add_middleware(GZipMiddleware, minimum_size=1000)

# Otimizar GeoJSON (remover propriedades desnecessárias)
def optimize_geojson(geojson: dict) -> dict:
    """Remove propriedades desnecessárias e otimiza formato"""
    # ...
    return optimized
```

**Impacto:** Médio — Reduz tempo de transferência para dados grandes.

---

## 11. Batch de Requisições de Elevação

### Problema
Sync de elevação para múltiplos nós pode gerar muitas requisições.

### Solução
Agrupar múltiplos nós em uma única requisição.

**Implementação:**
```typescript
// client/features/map/services/ElevationService.ts
async fetchElevationsForNodes(
  nodes: MapNode[],
  bbox: BoundingBox
): Promise<MapNode[]> {
  // Agrupar todos os nós em uma requisição
  const positions = nodes.map(n => n.position);
  
  const response = await fetch('/api/elevation/batch', {
    method: 'POST',
    body: JSON.stringify({ positions, bbox }),
  });
  
  const elevations = await response.json();
  // Aplicar elevações aos nós
  return nodes.map((node, i) => ({
    ...node,
    elevation: elevations[i],
  }));
}
```

**Impacto:** Alto — Reduz latência e carga no servidor.

---

## Priorização de Implementação

### Curto Prazo (Alto Impacto / Baixo Esforço)
1. ✅ **Cache de elevação no servidor** — Implementação simples, alto impacto
2. ✅ **Otimização de React Query** — Configuração rápida
3. ✅ **Compressão gzip** — Middleware simples

### Médio Prazo (Alto Impacto / Médio Esforço)
4. ✅ **Processamento de grafo no servidor** — Requer migração de lógica
5. ✅ **Batch de requisições de elevação** — Melhora eficiência
6. ✅ **Otimização de renderização Leaflet** — Canvas renderer

### Longo Prazo (Médio Impacto / Alto Esforço)
7. ✅ **Web Workers** — Requer refatoração
8. ✅ **Dividir MapContext** — Refatoração de estado
9. ✅ **Lazy loading** — Melhora bundle, mas impacto menor

---

## Métricas de Sucesso

Após implementar as otimizações, medir:

- **Tempo de resposta de elevação**: Redução de 50%+ com cache
- **FPS no mapa**: Manter >30fps com 1000+ nós
- **Tamanho de bundle**: Redução de 10-20% com lazy loading
- **Requisições de API**: Redução de 60%+ com cache e batch
- **Tempo de processamento de grafo**: Redução de 70%+ no servidor

---

## Conclusão

As otimizações mais impactantes são:
1. **Cache no servidor** (rápido, alto impacto)
2. **Processamento de grafo no servidor** (médio esforço, alto impacto)
3. **Otimização de renderização** (médio esforço, médio impacto)

Priorize essas três para obter os maiores ganhos de performance.
