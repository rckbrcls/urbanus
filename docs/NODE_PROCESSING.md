# Node Processing — Extração de Nós de Interseção

## Visão Geral

O sistema extrai nós de interseção a partir de um GeoJSON de ruas enriquecido com elevação. Apenas nós onde **3 ou mais ruas se encontram** (grau > 2) são retornados, eliminando milhares de vértices intermediários desnecessários.

## Algoritmo (`server/nodes.py`)

1. **Iteração**: percorre todas as features `LineString` e seus vértices
2. **Chave de posição**: cada coordenada é normalizada como `lat.toFixed(6),lng.toFixed(6)` (mesma precisão do frontend)
3. **Contagem de grau**: rastreia quantas ruas distintas (`street_id`) passam por cada posição
4. **Filtragem**: retorna apenas posições com grau > 2 (interseções reais)
5. **Elevação**: anexa a elevação de `vertex_elevations` da feature original
6. **Extremos**: identifica e marca o nó de **maior** e **menor** elevação global

## Endpoint

### `POST /nodes/extract`

**Request:**
```json
{
  "geojson": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": { "type": "LineString", "coordinates": [...] },
        "properties": {
          "id": "street-1",
          "name": "Av. Paulista",
          "vertex_elevations": [760.5, 761.2, ...]
        }
      }
    ]
  }
}
```

**Response:**
```json
{
  "nodes": [
    {
      "id": "uuid",
      "position": { "lat": -23.55, "lng": -46.63 },
      "elevation": 760.5,
      "degree": 3,
      "isIntersection": true,
      "isEndpoint": false,
      "connectedStreets": ["id1", "id2", "id3"],
      "streetNames": ["Av. Paulista", "R. Augusta"],
      "isHighestElevation": false,
      "isLowestElevation": false
    }
  ],
  "metadata": {
    "totalVertices": 1523,
    "totalUniquePositions": 1200,
    "filteredNodes": 87,
    "highestElevationNodeId": "uuid-abc",
    "lowestElevationNodeId": "uuid-xyz",
    "highestElevation": 810.2,
    "lowestElevation": 720.1
  }
}
```

## Fluxo de Dados Completo

```
bbox (seleção do mapa)
  → POST /api/streets (Overpass API → GeoJSON de ruas)
  → POST /api/elevation/enrich (OpenTopography → GeoJSON com elevação)
  → POST /api/nodes/extract (FastAPI → nós de interseção filtrados)
  → Renderização no mapa
```

Cada etapa corresponde a um estágio de processamento no frontend:
- `streets: loading/success/error`
- `topography: loading/success/error`
- `nodes: loading/success/error`

## Estilos Visuais

| Tipo | Cor | Radius | Descrição |
|------|-----|--------|-----------|
| Interseção (padrão) | `#8b5cf6` (violet) | 8 | Cruzamento com 3+ ruas |
| Maior Elevação | `#ef4444` (red) | 12 | Nó com a elevação mais alta |
| Menor Elevação | `#06b6d4` (cyan) | 12 | Nó com a elevação mais baixa |

Estados de interação (prioridade maior):
- Hovered: `#8b5cf6` (violet), radius 9
- Selected: `#3b82f6` (blue), radius 10
- Dragging: `#22c55e` (green), radius 11

## Relação com o Legado (URBANUS 1.0.0)

O algoritmo legado em `URBANUS-1.0.0/utils.py` utilizava processamento de grafo completo com normalização de arestas via Streamlit. O novo sistema:

- **Simplifica**: filtra apenas interseções reais (grau > 2) em vez de construir um grafo completo
- **Separa responsabilidades**: backend (Python) faz a extração, frontend apenas renderiza
- **Adiciona elevação**: marca extremos de elevação diretamente nos nós
- **É mais performático**: reduz de milhares de nós para apenas dezenas de interseções
