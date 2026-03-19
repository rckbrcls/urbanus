# 11 -- Servico de Elevacao e Topografia

## OpenTopography API

O URBANUS usa a API do OpenTopography para obter Modelos Digitais de Elevacao (DEMs) globais no formato GeoTIFF.

### Endpoint

```
GET https://portal.opentopography.org/API/globaldem
```

### Parametros

| Parametro | Tipo | Descricao |
|-----------|------|-----------|
| `demtype` | string | Identificador do DEM (COP30, NASADEM, etc.) |
| `south` | float | Latitude sul da bbox |
| `north` | float | Latitude norte da bbox |
| `west` | float | Longitude oeste da bbox |
| `east` | float | Longitude leste da bbox |
| `outputFormat` | string | `GTiff` (GeoTIFF) |
| `API_Key` | string | Chave de API |

### Autenticacao

Requer `OPENTOPOGRAPHY_API_KEY` como variavel de ambiente. A chave e gratuita para uso academico.

## DEMs Disponiveis

| DEM | Resolucao | Tipo | Cobertura | Observacoes |
|-----|-----------|------|-----------|-------------|
| COP30 | 30 m | DSM | Global (56S-84N) | **Padrao do URBANUS**. Copernicus. Inclui copas de arvores e edificios |
| COP90 | 90 m | DSM | Global | Versao reamostrada do COP30 |
| SRTMGL1 | 30 m | DSM | 60N-56S | NASA SRTM v3, lacunas preenchidas |
| SRTMGL3 | 90 m | DSM | 60N-56S | Versao original SRTM |
| NASADEM | 30 m | DSM | 60N-56S | SRTM reprocessado com ICESat, melhor que SRTMGL1 |
| AW3D30 | 30 m | DSM | Global | JAXA ALOS, bom em regioes montanhosas |
| FABDEM | 30 m | DTM | Global | Copernicus corrigido: copas e edificios removidos |
| EU_DTM | 30 m | DTM | Europa | Derivado de LiDAR europeu |
| GEDI_L3 | 1000 m | Altimetria | Tropical | GEDI LiDAR orbital |

### DSM vs DTM

- **DSM (Digital Surface Model)**: inclui superficies elevadas (copas de arvores, edificios, postes). COP30 e SRTM sao DSMs
- **DTM (Digital Terrain Model)**: superficie do terreno nua. FABDEM e EU_DTM sao DTMs

Para redes de esgoto, o DTM e preferivel (a tubulacao segue o terreno, nao as copas). O FABDEM seria ideal, mas o COP30 e usado como padrao por sua disponibilidade e por ser suficiente para o tracado preliminar.

## Pipeline de Processamento

```
1. Frontend envia request:
   POST /api/elevation/enrich
   { geojson, bbox: {south, north, west, east}, demType: "COP30" }

2. Next.js proxy encaminha para FastAPI:
   POST http://localhost:8000/elevation/enrich

3. FastAPI (services/elevation.py):
   a. Valida OPENTOPOGRAPHY_API_KEY
   b. Verifica area <= 100 km2
   c. GET OpenTopography -> bytes (GeoTIFF)
   d. rasterio.MemoryFile(bytes) -> dataset

4. Para cada Feature (LineString) no GeoJSON:
   a. Extrai coordenadas de cada vertice
   b. Amostra elevacao em cada coordenada:
      - Bilinear (sampling.py): 4 pixels vizinhos, interpolacao ponderada
      - Fallback nearest-neighbor: src.sample([(lng, lat)])
   c. Valida contra NODATA_THRESHOLD (-9000)
   d. Adiciona propriedades:
      - vertex_elevations: [float | null, ...]
      - elevation: {min, max, avg, range}

5. Retorna GeoJSON enriquecido
```

## Amostragem de Elevacao

### Interpolacao Bilinear (Preferida)

**Arquivo**: `core/elevation/sampling.py`

A interpolacao bilinear usa os 4 pixels vizinhos para calcular um valor suavizado:

```
(col0, row0)----(col1, row0)
    q11              q21
     |                |
     |    (col_f,     |
     |     row_f)     |
     |       *        |
     |                |
    q12              q22
(col0, row1)----(col1, row1)

val = q11*(1-dx)*(1-dy) + q21*dx*(1-dy) + q12*(1-dx)*dy + q22*dx*dy
```

Onde:
- `(col_f, row_f)` = coordenadas fracionarias do pixel
- `dx = col_f - floor(col_f)`, `dy = row_f - floor(row_f)`
- `q11, q21, q12, q22` = valores nos 4 cantos

Vantagem: suaviza degraus entre pixels, produzindo perfis de elevacao mais realistas para calculo de declividade.

### Nearest-Neighbor (Fallback)

**Arquivo**: `services/elevation.py`

Usado quando algum dos 4 pixels vizinhos contem `nodata`:

```python
sample = src.sample([(lng, lat)])
value = next(sample)[0]
```

O valor e validado contra `NODATA_THRESHOLD = -9000` e contra o valor `nodata` do raster.

## Estatisticas por Feature

Para cada LineString enriquecida, o servico calcula:

```python
{
    "vertex_elevations": [312.5, 315.2, 318.0, None, 310.1],
    "elevation": {
        "min": 310.1,
        "max": 318.0,
        "avg": 313.95,
        "range": 7.9
    }
}
```

Vertices com elevacao `None` (fora do raster ou nodata) sao excluidos do calculo de estatisticas.

## Limitacoes

### Resolucao (30 m)

O COP30 tem resolucao de ~30 metros. Para redes urbanas com lotes de 10-15 m de frente, um unico pixel pode cobrir 2-3 lotes. A declividade calculada entre vertices proximos pode ser imprecisa.

Mitigacao: a interpolacao bilinear suaviza os degraus, e o pipeline usa `ELEVATION_PROMINENCE_MIN = 2.0 m` para ignorar ruido.

### DSM vs DTM

O COP30 e um DSM -- inclui copas de arvores e topos de edificios. Em areas densamente arborizadas ou com edificios altos, a elevacao pode ser 5-30 m superior ao terreno real.

Mitigacao futura: migrar para FABDEM (DTM derivado do Copernicus com copas e edificios removidos algoritmicamente).

### Nodata e Bordas

Vertices na borda do raster ou sobre corpos d'agua podem retornar `nodata`. O sistema trata esses casos como `None`, propagando a ausencia para as etapas seguintes.

### Ruido Urbano

Em areas urbanas densas, o DEM pode apresentar ruido causado por:
- Edificios altos criando "picos" artificiais
- Sombras de radar (SRTM) causando vales artificiais
- Artefatos de pos-processamento

O filtro de proeminencia (Etapa 5) elimina a maioria desses artefatos, mas casos extremos podem exigir revisao manual.

## Proposta de Cache em Disco

Atualmente, cada requisicao de elevacao baixa um novo GeoTIFF do OpenTopography. Para areas grandes ou requisicoes repetidas, isso e ineficiente.

Proposta (descrita em `URBANUS_REFATORACAO_PIPELINE_DADOS.md`):
- Cache em disco com chave `{demType}_{south}_{north}_{west}_{east}.tif`
- TTL configuravel (padrao: 24h)
- Limpeza periodica de cache antigo
- Verificacao de sobreposicao: se o cache ja contem a area requisitada, reutilizar
