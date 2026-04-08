# 11 -- Elevacao e DEM

## Escopo atual

O runtime atual usa OpenTopography apenas para o fluxo de enriquecimento de elevacao por vertice.

Superficie suportada:

```text
POST /api/elevation/enrich   # Next.js -> FastAPI
POST /elevation/enrich       # FastAPI
```

Nao existe mais rota de download direto de GeoTIFF no produto suportado.

## Fluxo

```text
frontend
  -> POST /api/elevation/enrich
  -> proxy Next.js
  -> POST /elevation/enrich
  -> FastAPI baixa GeoTIFF do OpenTopography
  -> rasterio amostra cada vertice do GeoJSON
  -> retorna FeatureCollection enriquecida
```

## Request

```json
{
  "geojson": { "...": "..." },
  "bbox": {
    "south": -23.6,
    "north": -23.5,
    "west": -46.7,
    "east": -46.6
  },
  "demType": "COP30"
}
```

## Resposta

Cada `LineString` volta com:

- `vertex_elevations`
- `elevation.min`
- `elevation.max`
- `elevation.avg`
- `elevation.range`

## Comportamento do servico

Arquivo: `apps/api/src/urbanus_api/services/elevation.py`

1. valida a area da bbox
2. verifica `OPENTOPOGRAPHY_API_KEY`
3. baixa o DEM
4. abre o raster em memoria
5. amostra cada vertice
6. trata `nodata` e zeros espurios de borda
7. interpola lacunas locais quando possivel
8. devolve o GeoJSON enriquecido

## Papel no produto

- a home usa esse enriquecimento antes de chamar `/nodes/extract`
- o pipeline de processamento depende das elevacoes presentes no grafo editado enviado depois pelo editor

O nome de estagio "topography" ainda aparece no frontend por compatibilidade visual da home, mas funcionalmente ele representa apenas o enriquecimento de elevacao do GeoJSON.
