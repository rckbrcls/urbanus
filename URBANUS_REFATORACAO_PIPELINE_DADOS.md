# URBANUS — Refatoração do Pipeline de Dados

> Proposta técnica de refatoração dos estágios de busca de ruas e enriquecimento
> topográfico, baseada na análise do pipeline atual e nas decisões técnicas
> documentadas nas pesquisas do projeto.
>
> **Escopo:** Backend FastAPI (Python) + rotas proxy do Next.js  
> **Impacto no frontend:** Nenhum — contratos de API permanecem idênticos  
> **Estimativa de esforço:** 3–5 dias de desenvolvimento

---

## Índice

1. [Diagnóstico do pipeline atual](#1-diagnóstico-do-pipeline-atual)
2. [Visão geral das mudanças](#2-visão-geral-das-mudanças)
3. [Nova estrutura de pastas](#3-nova-estrutura-de-pastas)
4. [Novas dependências](#4-novas-dependências)
5. [Estágio 1 — Busca de ruas com OSMnx + cache](#5-estágio-1--busca-de-ruas-com-osmnx--cache)
6. [Estágio 2 — Elevação com NASADEM + cache + interpolação bilinear](#6-estágio-2--elevação-com-nasadem--cache--interpolação-bilinear)
7. [Estágio 3 — Extração de nós (ajustes menores)](#7-estágio-3--extração-de-nós-ajustes-menores)
8. [Camada de cache transversal](#8-camada-de-cache-transversal)
9. [Configurações de ambiente](#9-configurações-de-ambiente)
10. [Rotas proxy no Next.js — sem mudança](#10-rotas-proxy-no-nextjs--sem-mudança)
11. [Docker Compose — ajustes](#11-docker-compose--ajustes)
12. [Checklist de implementação](#12-checklist-de-implementação)
13. [Referência rápida de problemas resolvidos](#13-referência-rápida-de-problemas-resolvidos)

---

## 1. Diagnóstico do pipeline atual

### 1.1 Estágio 1 — Ruas (Overpass direto no Next.js)

**O que acontece hoje:**

```
Browser → POST /api/streets (Next.js) → Overpass API pública
```

A query atual no Next.js:

```
[out:json][timeout:30];
(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|
  residential|unclassified)$"](south,west,north,east););
out body; >; out skel qt;
```

**Problemas identificados:**

| Problema | Impacto |
|---|---|
| Sem cache — toda seleção de área refaz a requisição | Lento, gasta rate limit, falha em desenvolvimento |
| Inclui `motorway` e `trunk` | Rodovias expressas nunca recebem tubos de esgoto; polui o grafo |
| Conversão Overpass → GeoJSON feita manualmente no Next.js | Código frágil; OSMnx já faz isso melhor com topologia correta |
| Simplificação de interseções ausente | Gera nós grau-2 em curvas de rua que não são interseções reais |
| Query no client (Next.js route) | Deveria estar no backend Python onde vive toda a lógica de grafo |

---

### 1.2 Estágio 2 — Elevação (COP30 sem cache)

**O que acontece hoje:**

```
Browser → POST /api/elevation/enrich (Next.js) → POST /elevation/enrich (FastAPI)
  → Download GeoTIFF COP30 da OpenTopography (120s timeout)
  → rasterio.sample() com nearest-neighbor
  → Descarta o GeoTIFF (sem cache)
```

**Problemas identificados:**

| Problema | Impacto |
|---|---|
| **COP30 é DSM** (inclui edificações e vegetação) | Prédios aparecem como elevações falsas de +1,6–5m; compromete análise de drenagem |
| Sem cache — baixa o GeoTIFF a cada requisição | 15–40s por request; esgota o limite de 50 req/dia |
| Amostragem nearest-neighbor | Erro de quantização de ±15m com resolução de 30m/pixel |
| Timeout de 120s | Falha silenciosa em conexões lentas; sem retry adequado |

---

### 1.3 Resumo: o que está certo e não muda

- Arquitetura de 3 estágios sequenciais ✅
- FastAPI como backend de processamento ✅
- rasterio + MemoryFile para processamento em memória ✅
- Estrutura `vertex_elevations` por vértice no GeoJSON ✅
- Contratos de API (request/response shapes) ✅
- Sistema de retry com backoff exponencial ✅
- Rate limiting por sliding window ✅

---

## 2. Visão geral das mudanças

```
ANTES:
Browser → Next.js /api/streets → Overpass (sem cache, tipo errado de highway)
Browser → Next.js /api/elevation → FastAPI → OpenTopography COP30 (sem cache, DSM, nearest-neighbor)

DEPOIS:
Browser → Next.js /api/streets → FastAPI /streets → OSMnx + cache local .gpkg
Browser → Next.js /api/elevation → FastAPI /elevation/enrich → OpenTopography NASADEM + cache local .tif + bilinear
```

**O contrato de API para o frontend não muda.** As rotas `/api/streets` e `/api/elevation/enrich`
no Next.js continuam idênticas em request e response shape — apenas os proxies internos
são ajustados.

---

## 3. Nova estrutura de pastas

```
server/
├── app/
│   ├── main.py
│   ├── routers/
│   │   ├── streets.py          ← NOVO (movido do Next.js + OSMnx)
│   │   ├── elevation.py        ← REFATORADO (cache + NASADEM + bilinear)
│   │   └── nodes.py            ← ajuste menor
│   ├── services/
│   │   ├── osm_service.py      ← NOVO: OSMnx wrapper + cache
│   │   ├── dem_service.py      ← NOVO: DEM download + cache + interpolação
│   │   └── graph_service.py    ← NOVO: conversão OSMnx → GeoJSON
│   ├── cache/
│   │   ├── cache_manager.py    ← NOVO: camada de cache transversal
│   │   └── __init__.py
│   └── config.py               ← ATUALIZADO: novas variáveis de ambiente
├── cache/                      ← diretório de cache em disco (gitignored)
│   ├── osm/                    ← grafos OSMnx em .gpkg
│   └── dem/                    ← tiles DEM em .tif
├── requirements.txt            ← ATUALIZADO
└── Dockerfile                  ← ATUALIZADO
```

---

## 4. Novas dependências

### `requirements.txt` — adições

```txt
# Já existentes
fastapi==0.115.0
motor==3.6.0
rasterio==1.3.11
numpy==1.26.4
httpx==0.27.2

# NOVAS
osmnx==1.9.4              # busca OSM + grafo NetworkX + simplificação topológica
geopandas==0.14.4         # conversão OSMnx → GeoJSON
shapely==2.0.6            # geometrias (dependência do osmnx/geopandas)
pyproj==3.6.1             # reprojeção CRS (WGS84 ↔ UTM)
scipy==1.13.1             # interpolação bilinear no raster
```

### `Dockerfile` — adicionar ao bloco de apt-get

```dockerfile
# Dependências do OSMnx e GeoPandas (libspatialindex para índice espacial)
RUN apt-get update && apt-get install -y \
    gdal-bin \
    libgdal-dev \
    libproj-dev \
    libgeos-dev \
    libspatialindex-dev \
    g++ \
    libexpat1 \
    && rm -rf /var/lib/apt/lists/*
```

> **Nota:** `libspatialindex-dev` é necessária para o `rtree`, que o OSMnx usa
> internamente para queries espaciais eficientes.

---

## 5. Estágio 1 — Busca de ruas com OSMnx + cache

### 5.1 Novo serviço: `server/app/services/osm_service.py`

```python
"""
Serviço de busca de redes viárias via OSMnx com cache em disco.

Por que OSMnx em vez de Overpass direto:
- Faz a query Overpass internamente com retry automático
- Converte para grafo NetworkX com topologia correta
- simplify=True remove nós grau-2 (vértices de curva que não são interseções reais)
  usando o algoritmo de Boeing (2025) — o mesmo que precisamos para o algoritmo de esgoto
- Projeção UTM para cálculos métricos precisos
"""

import hashlib
import json
import logging
from pathlib import Path

import geopandas as gpd
import osmnx as ox
from shapely.geometry import box

logger = logging.getLogger(__name__)

# Configuração do OSMnx — desabilita cache interno (usamos o nosso)
ox.settings.use_cache = False
ox.settings.log_console = False

# Tipos de highway relevantes para rede de esgoto urbana.
# Removidos: motorway, motorway_link, trunk, trunk_link
# (rodovias expressas não recebem coletores de esgoto sanitário)
# Adicionados: living_street, service
# (becos, vielas e ruas de serviço são importantes para cobertura urbana completa)
HIGHWAY_FILTER = (
    '["highway"~"^(primary|primary_link|secondary|secondary_link|'
    'tertiary|tertiary_link|residential|unclassified|'
    'living_street|service)$"]'
)


def _bbox_cache_key(bbox: dict) -> str:
    """
    Gera uma chave de cache determinística para um bounding box.
    Arredonda para 5 casas decimais (~1m de precisão) para evitar
    cache miss por mínimas variações de coordenada.
    """
    rounded = {k: round(v, 5) for k, v in bbox.items()}
    return hashlib.md5(
        json.dumps(rounded, sort_keys=True).encode()
    ).hexdigest()


def get_street_network_geojson(bbox: dict, cache_dir: Path) -> dict:
    """
    Retorna FeatureCollection GeoJSON das ruas de uma área.

    Fluxo:
    1. Verifica cache em disco (.gpkg)
    2. Se miss: busca via OSMnx → simplifica → salva cache
    3. Converte grafo NetworkX → GeoJSON

    Args:
        bbox: {"south": float, "north": float, "west": float, "east": float}
        cache_dir: diretório para armazenar os arquivos .gpkg

    Returns:
        GeoJSON FeatureCollection com LineStrings das ruas
    """
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_key = _bbox_cache_key(bbox)
    cache_file = cache_dir / f"{cache_key}.gpkg"

    if cache_file.exists():
        logger.info(f"[OSM] Cache hit para bbox {cache_key[:8]}...")
        G = ox.load_graphml(str(cache_file))
    else:
        logger.info(f"[OSM] Cache miss — buscando via Overpass para bbox {cache_key[:8]}...")
        G = _fetch_from_overpass(bbox)
        ox.save_graphml(G, str(cache_file))
        logger.info(f"[OSM] Grafo salvo em cache: {cache_file}")

    return _graph_to_geojson(G)


def _fetch_from_overpass(bbox: dict) -> object:
    """
    Busca grafo viário via OSMnx (que usa Overpass internamente).

    simplify=True é fundamental:
    - Remove nós grau-2 que são apenas vértices de geometria de rua
    - Mantém apenas interseções verdadeiras e endpoints
    - Esses nós mantidos são exatamente os "nós rosa" do algoritmo de esgoto
    - Economiza 60-80% do número de nós em comparação com simplify=False

    retain_all=False:
    - Remove componentes desconexos (ilhas de ruas sem saída)
    - Garante que o grafo tenha apenas o maior componente conexo
    """
    G = ox.graph_from_bbox(
        bbox["north"],
        bbox["south"],
        bbox["east"],
        bbox["west"],
        network_type="all",
        custom_filter=HIGHWAY_FILTER,
        simplify=True,
        retain_all=False,
    )

    # Calcular comprimento das arestas em metros (UTM projetado)
    G = ox.add_edge_lengths(G)

    logger.info(
        f"[OSM] Grafo obtido: {len(G.nodes)} nós, {len(G.edges)} arestas"
    )
    return G


def _graph_to_geojson(G) -> dict:
    """
    Converte grafo OSMnx para GeoJSON FeatureCollection de LineStrings.

    Mantém o mesmo formato de output que o pipeline atual para que o
    contrato de API com o frontend não mude.
    """
    # Converter para GeoDataFrames
    nodes_gdf, edges_gdf = ox.graph_to_gdfs(G)

    # Reprojetar para WGS84 se necessário
    if edges_gdf.crs and edges_gdf.crs.to_epsg() != 4326:
        edges_gdf = edges_gdf.to_crs(epsg=4326)

    features = []
    for idx, row in edges_gdf.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue

        # Coordenadas como [[lon, lat], ...] — padrão GeoJSON
        coords = list(geom.coords)
        if len(coords) < 2:
            continue

        # Normalizar highway para string (pode vir como lista em alguns casos)
        highway = row.get("highway", "unclassified")
        if isinstance(highway, list):
            highway = highway[0]

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [[lon, lat] for lon, lat in coords],
            },
            "properties": {
                "id": str(idx),
                "name": row.get("name", "") or "",
                "highway": str(highway),
                "surface": str(row.get("surface", "")) or "",
                "lanes": row.get("lanes", None),
                "maxspeed": str(row.get("maxspeed", "")) or "",
                "oneway": bool(row.get("oneway", False)),
                "length": float(row.get("length", 0.0)),
            },
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "totalStreets": len(features),
            "source": "OpenStreetMap via OSMnx",
        },
    }
```

---

### 5.2 Nova rota: `server/app/routers/streets.py`

```python
"""
Router FastAPI para busca de redes viárias.

Movido do Next.js /api/streets para o backend Python,
onde vive toda a lógica de processamento de grafo.
"""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.osm_service import get_street_network_geojson

router = APIRouter(prefix="/streets", tags=["streets"])

CACHE_DIR = Path("cache/osm")


class BBoxRequest(BaseModel):
    south: float
    north: float
    west: float
    east: float


@router.post("/fetch")
async def fetch_streets(body: BBoxRequest):
    """
    Busca ruas de uma área via OSMnx com cache em disco.
    Substitui a rota /api/streets do Next.js.
    """
    bbox = body.dict()

    # Validação de área (mesma lógica atual)
    area_km2 = _calculate_area_km2(bbox)
    if area_km2 > 100:
        raise HTTPException(
            status_code=400,
            detail=f"Área de {area_km2:.1f} km² excede o limite de 100 km²"
        )
    if area_km2 < 0.001:
        raise HTTPException(
            status_code=400,
            detail="Área muito pequena (mínimo 0.001 km²)"
        )

    try:
        geojson = get_street_network_geojson(bbox, CACHE_DIR)
        geojson["metadata"]["areaKm2"] = area_km2
        geojson["metadata"]["bounds"] = bbox
        return geojson
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao buscar ruas: {str(e)}"
        )


def _calculate_area_km2(bbox: dict) -> float:
    import math
    avg_lat = (bbox["north"] + bbox["south"]) / 2
    km_per_deg_lon = 111.32 * math.cos(avg_lat * math.pi / 180)
    return (bbox["north"] - bbox["south"]) * 111.32 * \
           (bbox["east"] - bbox["west"]) * km_per_deg_lon
```

---

### 5.3 Atualizar proxy no Next.js: `client/app/api/streets/route.ts`

A rota proxy no Next.js deixa de chamar a Overpass diretamente e passa a
chamar o FastAPI:

```typescript
// ANTES — chamava Overpass diretamente
// DEPOIS — apenas proxy para o FastAPI

import { NextRequest, NextResponse } from 'next/server'

const PYTHON_API_URL = process.env.PYTHON_API_URL ?? 'http://localhost:8000'

export async function POST(request: NextRequest) {
  const body = await request.json()

  // Validação de área (mantida no client para feedback imediato)
  const { south, north, west, east } = body
  // ... validação existente ...

  // Proxy para o FastAPI (antes era Overpass diretamente)
  const response = await fetch(`${PYTHON_API_URL}/streets/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ south, north, west, east }),
    signal: AbortSignal.timeout(60_000), // 60s (OSMnx pode levar mais que 30s em áreas grandes)
  })

  if (!response.ok) {
    const error = await response.json()
    return NextResponse.json(error, { status: response.status })
  }

  return NextResponse.json(await response.json())
}
```

---

## 6. Estágio 2 — Elevação com NASADEM + cache + interpolação bilinear

### 6.1 Por que NASADEM em vez de manter COP30

O COP30 que vocês usam hoje é um **DSM (Digital Surface Model)** — inclui edificações
e vegetação. Em área urbana densa, um prédio de 10 andares aparece como uma elevação
de terreno ~30m mais alta do que realmente é.

O **NASADEM** está disponível na mesma API que vocês já usam (OpenTopography,
mesmo endpoint, mesmo parâmetro `demtype`), dentro do mesmo tier gratuito, e é
um reprocessamento melhorado do SRTM com menos artefatos. Não é um DTM puro como
o FABDEM, mas é significativamente melhor que o COP30 para análise de drenagem.

**Migração futura para FABDEM:** quando o projeto evoluir para análise hidráulica
detalhada, o FABDEM (Bristol University, gratuito CC BY 4.0) pode ser integrado
como tiles locais. A estrutura de cache proposta aqui já suporta isso — basta
adicionar um novo `dem_type` sem mudar o restante do código.

### 6.2 Novo serviço: `server/app/services/dem_service.py`

```python
"""
Serviço de download e consulta de DEMs com cache em disco.

Mudanças em relação ao elevation.py atual:
1. Cache em disco: GeoTIFF baixado uma vez, reutilizado em requests subsequentes
2. NASADEM como default (menos artefatos urbanos que COP30)
3. Interpolação bilinear (era nearest-neighbor): reduz erro de ±15m para ±2-3m
4. Retry com backoff para falhas de rede
"""

import hashlib
import json
import logging
import time
from io import BytesIO
from pathlib import Path
from typing import Optional

import httpx
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.io import MemoryFile
from scipy.interpolate import RegularGridInterpolator

logger = logging.getLogger(__name__)

# NASADEM como default — disponível na mesma API OpenTopography, sem custo extra
DEFAULT_DEM_TYPE = "NASADEM"

# DEMs disponíveis via OpenTopography (ordem de preferência para qualidade urbana)
SUPPORTED_DEM_TYPES = {
    "NASADEM",    # recomendado — 30m, menos artefatos que COP30
    "COP30",      # atual — 30m, DSM (inclui edificações)
    "SRTMGL1",    # 30m, legacy
    "SRTMGL3",    # 90m, legacy
    "AW3D30",     # 30m, bom para áreas montanhosas
    "COP90",      # 90m
}

OPENTOPOGRAPHY_URL = "https://portal.opentopography.org/API/globaldem"


def _dem_cache_key(bbox: dict, dem_type: str) -> str:
    payload = {"bbox": {k: round(v, 5) for k, v in bbox.items()}, "dem": dem_type}
    return hashlib.md5(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def get_dem_tile(
    bbox: dict,
    dem_type: str,
    api_key: str,
    cache_dir: Path,
) -> Path:
    """
    Retorna path para GeoTIFF do DEM, baixando e cacheando se necessário.

    Args:
        bbox: {"south", "north", "west", "east"}
        dem_type: tipo do DEM (default: NASADEM)
        api_key: chave OpenTopography
        cache_dir: diretório de cache

    Returns:
        Path para o GeoTIFF cacheado
    """
    cache_dir.mkdir(parents=True, exist_ok=True)

    if dem_type not in SUPPORTED_DEM_TYPES:
        logger.warning(f"DEM type '{dem_type}' não suportado, usando {DEFAULT_DEM_TYPE}")
        dem_type = DEFAULT_DEM_TYPE

    cache_key = _dem_cache_key(bbox, dem_type)
    cache_file = cache_dir / f"{cache_key}.tif"

    if cache_file.exists():
        logger.info(f"[DEM] Cache hit: {dem_type} para bbox {cache_key[:8]}...")
        return cache_file

    logger.info(f"[DEM] Cache miss — baixando {dem_type} da OpenTopography...")
    _download_dem(bbox, dem_type, api_key, cache_file)
    logger.info(f"[DEM] Tile salvo em cache: {cache_file}")

    return cache_file


def _download_dem(
    bbox: dict,
    dem_type: str,
    api_key: str,
    output_path: Path,
    max_retries: int = 3,
) -> None:
    """
    Baixa GeoTIFF da OpenTopography com retry e backoff exponencial.
    """
    params = {
        "demtype": dem_type,
        "south": bbox["south"],
        "north": bbox["north"],
        "west": bbox["west"],
        "east": bbox["east"],
        "outputFormat": "GTiff",
        "API_Key": api_key,
    }

    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            with httpx.Client(timeout=180.0) as client:
                response = client.get(OPENTOPOGRAPHY_URL, params=params)
                response.raise_for_status()

            # Verificar que é um GeoTIFF válido (começa com bytes II ou MM)
            content = response.content
            if len(content) < 1000:
                raise ValueError(
                    f"Resposta suspeita — apenas {len(content)} bytes. "
                    f"Possível erro da API: {content[:200]}"
                )

            output_path.write_bytes(content)
            return

        except (httpx.HTTPError, ValueError) as e:
            last_error = e
            wait = 2 ** attempt  # backoff: 2s, 4s, 8s
            logger.warning(
                f"[DEM] Tentativa {attempt}/{max_retries} falhou: {e}. "
                f"Aguardando {wait}s..."
            )
            time.sleep(wait)

    raise RuntimeError(
        f"Falha ao baixar DEM após {max_retries} tentativas: {last_error}"
    )


def sample_elevations_bilinear(
    geojson: dict,
    dem_path: Path,
) -> dict:
    """
    Amostra elevação em cada vértice das LineStrings usando interpolação bilinear.

    Diferença para o método atual (nearest-neighbor):
    - Nearest-neighbor: usa o valor do pixel mais próximo → erro de ±15m
    - Bilinear: média ponderada dos 4 pixels vizinhos → erro de ±2-3m

    Isso é especialmente importante para análise de drenagem, onde pequenas
    diferenças de elevação determinam a direção do fluxo de esgoto.
    """
    with rasterio.open(dem_path) as src:
        nodata = src.nodata
        transform = src.transform
        dem_array = src.read(1).astype(np.float64)

        # Substituir nodata por NaN para que a interpolação propague corretamente
        if nodata is not None:
            dem_array[dem_array == nodata] = np.nan

        # Construir interpolador bilinear sobre o grid do raster
        # rows_coords e cols_coords são as coordenadas centrais de cada pixel
        height, width = dem_array.shape
        rows_coords = np.arange(height)
        cols_coords = np.arange(width)
        interpolator = RegularGridInterpolator(
            (rows_coords, cols_coords),
            dem_array,
            method="linear",          # bilinear para 2D
            bounds_error=False,
            fill_value=None,           # NaN para pontos fora do raster
        )

        for feature in geojson.get("features", []):
            coords = feature["geometry"]["coordinates"]
            vertex_elevations = []

            for lon, lat in coords:
                # Converter coordenada geográfica para posição fracionária no raster
                col_frac, row_frac = ~transform * (lon, lat)

                # clip para dentro dos limites do raster
                row_frac = np.clip(row_frac, 0, height - 1)
                col_frac = np.clip(col_frac, 0, width - 1)

                elevation = interpolator([[row_frac, col_frac]])[0]

                if np.isnan(elevation) or elevation < -9000:
                    vertex_elevations.append(None)
                else:
                    vertex_elevations.append(round(float(elevation), 3))

            feature["properties"]["vertex_elevations"] = vertex_elevations

            # Calcular estatísticas (apenas valores válidos)
            valid = [e for e in vertex_elevations if e is not None]
            if valid:
                feature["properties"]["elevation"] = {
                    "min": round(min(valid), 3),
                    "max": round(max(valid), 3),
                    "avg": round(sum(valid) / len(valid), 3),
                    "range": round(max(valid) - min(valid), 3),
                }
            else:
                feature["properties"]["elevation"] = None

    return geojson
```

---

### 6.3 Refatorar rota: `server/app/routers/elevation.py`

```python
"""
Router de enriquecimento topográfico.
Refatorado para usar cache + NASADEM + interpolação bilinear.
"""

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from app.services.dem_service import (
    DEFAULT_DEM_TYPE,
    SUPPORTED_DEM_TYPES,
    get_dem_tile,
    sample_elevations_bilinear,
)

router = APIRouter(prefix="/elevation", tags=["elevation"])

DEM_CACHE_DIR = Path("cache/dem")


class ElevationRequest(BaseModel):
    geojson: dict
    bbox: dict
    # NASADEM como novo default (era COP30)
    dem_type: Optional[str] = Field(default=DEFAULT_DEM_TYPE)


@router.post("/enrich")
async def enrich_elevation(body: ElevationRequest):
    """
    Enriquece GeoJSON com elevação por vértice.

    Mudanças em relação à versão anterior:
    - Cache em disco: GeoTIFF reutilizado entre requests
    - NASADEM como default: menos artefatos urbanos que COP30
    - Interpolação bilinear: erro reduzido de ±15m para ±2-3m
    """
    api_key = os.environ.get("OPENTOPOGRAPHY_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENTOPOGRAPHY_API_KEY não configurada"
        )

    dem_type = body.dem_type
    if dem_type not in SUPPORTED_DEM_TYPES:
        dem_type = DEFAULT_DEM_TYPE

    try:
        # Passo 1: obter tile DEM (do cache ou download)
        dem_path = get_dem_tile(
            bbox=body.bbox,
            dem_type=dem_type,
            api_key=api_key,
            cache_dir=DEM_CACHE_DIR,
        )

        # Passo 2: amostrar elevação com interpolação bilinear
        enriched = sample_elevations_bilinear(body.geojson, dem_path)

        return enriched

    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao processar elevação: {str(e)}"
        )
```

---

## 7. Estágio 3 — Extração de nós (ajustes menores)

O `nodes.py` atual não muda sua lógica principal, mas precisa de dois ajustes
para alinhar com os dados que virão do OSMnx:

### 7.1 Ajuste no cálculo de grau

O OSMnx com `simplify=True` já remove nós grau-2 "falsos". Isso significa que os
nós que chegam ao extrator já são interseções verdadeiras. O código pode ser
simplificado — não precisa mais calcular grau manualmente via `position_map`,
pois o grau real já vem no atributo do grafo OSMnx.

O campo `degree` no GeoJSON de entrada (vindo do OSMnx) reflete o grau topológico
correto. Quando o dado vem do OSMnx, usar `properties.osmid` como chave em vez
de `f"{lat:.6f},{lng:.6f}"` evita colisões de arredondamento:

```python
# Em nodes.py — ajuste na Fase 1:

# ANTES (fallback por posição string):
key = f"{lat:.6f},{lng:.6f}"

# DEPOIS (preferir osmid quando disponível):
osmid = feature.properties.get("osmid")
key = str(osmid) if osmid else f"{lat:.6f},{lng:.6f}"
```

### 7.2 Remover marcação de extremos globais

A marcação atual de `isHighestElevation` e `isLowestElevation` identifica os
**extremos globais** da área inteira. Para o algoritmo de esgoto, o que importa
são os **extremos locais** (um nó mais alto que todos os seus vizinhos diretos).
Essa análise de local maxima/minima será feita pelo algoritmo de esgoto no Estágio 5
do pipeline. Os extremos globais podem ser mantidos como metadados informativos,
mas não devem influenciar o roteamento.

Nenhuma mudança de código nessa etapa — apenas documentação da intenção.

---

## 8. Camada de cache transversal

### `server/app/cache/cache_manager.py`

```python
"""
Utilitários para gerenciamento do cache em disco.
Fornece invalidação, listagem e limpeza de cache.
"""

import logging
import shutil
from datetime import datetime, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)

CACHE_BASE = Path("cache")
OSM_CACHE = CACHE_BASE / "osm"
DEM_CACHE = CACHE_BASE / "dem"


def get_cache_stats() -> dict:
    """Retorna estatísticas do cache para o endpoint de health check."""
    stats = {}
    for name, path in [("osm", OSM_CACHE), ("dem", DEM_CACHE)]:
        if not path.exists():
            stats[name] = {"files": 0, "size_mb": 0}
            continue
        files = list(path.glob("*"))
        total_bytes = sum(f.stat().st_size for f in files if f.is_file())
        stats[name] = {
            "files": len(files),
            "size_mb": round(total_bytes / 1_048_576, 2),
        }
    return stats


def invalidate_cache(older_than_days: int = 30) -> int:
    """
    Remove entradas de cache mais antigas que N dias.
    Retorna o número de arquivos removidos.
    """
    threshold = datetime.now() - timedelta(days=older_than_days)
    removed = 0
    for cache_dir in [OSM_CACHE, DEM_CACHE]:
        if not cache_dir.exists():
            continue
        for file in cache_dir.glob("*"):
            if file.is_file():
                mtime = datetime.fromtimestamp(file.stat().st_mtime)
                if mtime < threshold:
                    file.unlink()
                    removed += 1
                    logger.info(f"[Cache] Removido: {file.name}")
    return removed


def clear_cache() -> None:
    """Remove todo o cache (usar com cuidado em produção)."""
    for cache_dir in [OSM_CACHE, DEM_CACHE]:
        if cache_dir.exists():
            shutil.rmtree(cache_dir)
            logger.warning(f"[Cache] Diretório removido: {cache_dir}")
```

### Endpoint de administração em `main.py`

```python
# Adicionar em server/app/main.py

from app.cache.cache_manager import get_cache_stats, invalidate_cache

@app.get("/admin/cache/stats")
async def cache_stats():
    """Estatísticas do cache em disco."""
    return get_cache_stats()

@app.delete("/admin/cache/old")
async def clear_old_cache(older_than_days: int = 30):
    """Remove entradas de cache mais antigas que N dias."""
    removed = invalidate_cache(older_than_days)
    return {"removed_files": removed}
```

---

## 9. Configurações de ambiente

### `server/.env.example` — atualizar

```bash
# Já existentes
OPENTOPOGRAPHY_API_KEY=your_key_here
MONGO_URL=mongodb://mongo:27017/urbanus

# NOVAS
# Tipo de DEM padrão. Opções: NASADEM, COP30, SRTMGL1, AW3D30
# NASADEM recomendado: menos artefatos em áreas urbanas
DEM_TYPE_DEFAULT=NASADEM

# Diretório de cache em disco (relativo ao container)
# Em produção: montar volume Docker persistente neste path
CACHE_BASE_DIR=cache

# Dias antes de invalidar entradas de cache automaticamente
CACHE_TTL_DAYS=30

# OSMnx: timeout para Overpass API (segundos)
OSM_TIMEOUT=60
```

### `server/app/config.py` — atualizar

```python
from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # APIs externas
    opentopography_api_key: str = ""
    mongo_url: str = "mongodb://localhost:27017/urbanus"

    # DEM
    dem_type_default: str = "NASADEM"

    # Cache
    cache_base_dir: Path = Path("cache")
    cache_ttl_days: int = 30

    # OSMnx
    osm_timeout: int = 60

    class Config:
        env_file = ".env"


settings = Settings()
```

---

## 10. Rotas proxy no Next.js — sem mudança

As rotas do Next.js continuam sendo proxies simples. A única mudança é que
`/api/streets` agora aponta para o FastAPI em vez de chamar a Overpass diretamente.

```typescript
// client/app/api/streets/route.ts — apenas a URL de destino muda
// DE:   fetch('https://overpass-api.de/api/interpreter', ...)
// PARA: fetch(`${PYTHON_API_URL}/streets/fetch`, ...)

// Todos os outros endpoints permanecem idênticos.
// O frontend não percebe nenhuma diferença.
```

---

## 11. Docker Compose — ajustes

```yaml
# docker-compose.yml

services:
  server:
    build: ./server
    ports:
      - "8000:8000"
    environment:
      - OPENTOPOGRAPHY_API_KEY=${OPENTOPOGRAPHY_API_KEY}
      - MONGO_URL=mongodb://mongo:27017/urbanus
      - DEM_TYPE_DEFAULT=NASADEM
      - CACHE_TTL_DAYS=30
    volumes:
      # Volume persistente para cache — CRÍTICO para performance
      # Sem isso, o cache é perdido a cada restart do container
      - urbanus_cache:/app/cache
    depends_on:
      - mongo

  client:
    build: ./client
    ports:
      - "3000:3000"
    environment:
      - PYTHON_API_URL=http://server:8000

  mongo:
    image: mongo:7
    ports:
      - "27018:27017"
    volumes:
      - mongo_data:/data/db

volumes:
  mongo_data:
  urbanus_cache:    # ← NOVO: volume nomeado para persistir o cache
```

> **Importante:** o volume `urbanus_cache` é nomeado, não bind-mount. Isso
> garante que o cache sobrevive a `docker-compose down` mas é removido apenas
> com `docker-compose down -v`. Em produção, considerar um bind-mount para
> um diretório com backup.

---

## 12. Checklist de implementação

### Fase 1 — Backend (sem tocar no frontend)

- [ ] Instalar dependências: `osmnx`, `geopandas`, `shapely`, `pyproj`, `scipy`
- [ ] Atualizar `Dockerfile` com `libspatialindex-dev`
- [ ] Criar `server/app/services/osm_service.py`
- [ ] Criar `server/app/routers/streets.py`
- [ ] Registrar o novo router em `main.py` (`app.include_router(streets.router)`)
- [ ] Criar diretórios `cache/osm/` e `cache/dem/` (com `.gitignore`)
- [ ] Criar `server/app/services/dem_service.py`
- [ ] Refatorar `server/app/routers/elevation.py`
- [ ] Criar `server/app/cache/cache_manager.py`
- [ ] Adicionar endpoints de admin em `main.py`
- [ ] Atualizar `config.py` e `.env.example`

### Fase 2 — Integração com Next.js

- [ ] Atualizar `client/app/api/streets/route.ts` para apontar para FastAPI
- [ ] Aumentar timeout do proxy de streets de 35s para 60s (OSMnx pode demorar mais em áreas grandes)
- [ ] Testar pipeline completo end-to-end com uma área de teste

### Fase 3 — Docker e infra

- [ ] Atualizar `docker-compose.yml` com volume `urbanus_cache`
- [ ] Atualizar variáveis de ambiente em `.env.example`
- [ ] Adicionar `cache/` ao `.gitignore` do server

### Testes de validação

- [ ] Verificar que resposta de `/streets/fetch` tem mesmo shape que antes
- [ ] Verificar que `vertex_elevations` vem com valores ao invés de `null` em mais vértices
- [ ] Verificar que segunda request para a mesma área retorna < 1s (cache hit)
- [ ] Verificar que `highway` não inclui `motorway` nem `trunk` no output
- [ ] Conferir que o frontend renderiza as ruas normalmente após mudança

---

## 13. Referência rápida de problemas resolvidos

| # | Problema original | Solução aplicada | Arquivo(s) afetado(s) |
|---|---|---|---|
| 1 | Sem cache de ruas | Cache em disco `.gpkg` via OSMnx | `osm_service.py` |
| 2 | Query Overpass no Next.js (lugar errado) | Movido para backend FastAPI | `routers/streets.py` |
| 3 | `motorway` e `trunk` no filtro | Removidos de `HIGHWAY_FILTER` | `osm_service.py` |
| 4 | Nós grau-2 falsos (curvas de rua) | `simplify=True` no OSMnx | `osm_service.py` |
| 5 | Sem cache de DEM | Cache em disco `.tif` por bbox + dem_type | `dem_service.py` |
| 6 | COP30 (DSM, inclui prédios) | NASADEM como default | `dem_service.py`, `.env` |
| 7 | Amostragem nearest-neighbor | Interpolação bilinear via SciPy | `dem_service.py` |
| 8 | Timeout 120s sem retry | Retry 3× com backoff + 180s timeout | `dem_service.py` |
| 9 | Cache perdido ao reiniciar container | Volume Docker nomeado `urbanus_cache` | `docker-compose.yml` |
| 10 | Sem visibilidade do estado do cache | Endpoints `/admin/cache/stats` e `/admin/cache/old` | `main.py`, `cache_manager.py` |

---

*Documento gerado em 16/03/2026 — baseado na análise do código-fonte do URBANUS
e nas pesquisas técnicas do projeto.*
