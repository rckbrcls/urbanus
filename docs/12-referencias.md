# 12 -- Referencias Academicas e Tecnicas

## Projetos Open-Source

### pysewer (UFZ -- Helmholtz Centre for Environmental Research)

Repositorio de referencia para tracado automatizado de redes de esgoto. Implementa:
- Extracao de rede viaria via OSMnx
- Modelagem de grafos com NetworkX
- Roteamento gravitacional baseado em DEM
- Dimensionamento basico de tubulacao

O pipeline de 8 etapas do URBANUS foi inspirado na abordagem do pysewer, com diferenciais:
- Interface web interativa (vs. scripts Python)
- Editor de grafos com undo/redo
- Dimensionamento completo NBR 9649 (vs. simplificado)
- Persistencia em PostGIS (vs. arquivos)

### sewergraph

Biblioteca Python para analise de redes de esgoto como grafos. Foca em:
- Modelagem topologica de redes existentes
- Analise de conectividade e fluxo
- Importacao/exportacao de formatos GIS

### QEsg (UFMG)

Plugin QGIS para dimensionamento de redes de esgoto. Implementa normas brasileiras (NBR 9649) com interface CAD. Referencia para validacao dos calculos hidraulicos do URBANUS.

### saniHUB Designer

Ferramenta online para projeto de redes de esgoto. Oferece dimensionamento automatizado e exportacao para SWMM. Referencia comercial para funcionalidades esperadas.

### TEKSI / QGEP (Suica)

Plugin QGIS para gerenciamento de infraestrutura de esgoto e drenagem. Modelo de dados VSA-DSS (norma suica). Referencia para modelagem de dados geoespaciais de redes.

## Literatura Academica

### Tracado e Otimizacao de Redes

**Duque, J.P. et al.** -- "Automated sewer network design using graph theory and optimization heuristics." Pesquisa sobre heuristicas de tracado automatizado, incluindo RSPH e variantes. Referencia principal para o algoritmo de roteamento do URBANUS.

**Hsieh, C.H. et al.** -- Trabalho sobre otimizacao de layout de redes de esgoto combinando algoritmos geneticos com modelagem de grafos. Explora trade-offs entre custo de escavacao e bombeamento.

**Haghighi, A. & Bakhshipour, A.E.** -- "Optimization of sewer network design using ant colony optimization." Abordagem bio-inspirada para minimizacao de custo total de redes de esgoto. Comparacao com RSPH em cenarios com topografia complexa.

**Saldarriaga, J. et al.** -- Pesquisa sobre dimensionamento otimizado de coletores de esgoto. Modelos de custo que consideram escavacao, tubulacao e estacoes de bombeamento.

### Arborescencias e Grafos

**Edmonds, J.** -- "Optimum branchings." Algoritmo original para encontrar a arborescencia de custo minimo em grafos direcionados. Complexidade O(VE). Implementado no URBANUS como alternativa ao RSPH via `networkx.minimum_spanning_arborescence()`.

**Chu, Y.J. & Liu, T.H.** -- Descoberta independente do algoritmo de arborescencia minima, frequentemente citado como Edmonds/Chu-Liu.

### Hidraulica e Normas

**Tsutiya, M.T. & Alem Sobrinho, P.** -- "Coleta e Transporte de Esgoto Sanitario." Referencia classica brasileira para projeto de redes coletoras. Base para implementacao das formulas da NBR 9649 no URBANUS.

## Normas Tecnicas

### NBR 9649 (ABNT, 1986)

**Projeto de redes coletoras de esgoto sanitario -- Procedimento**

Norma principal implementada no URBANUS. Define:
- Tensao trativa minima (1.0 Pa para n=0.013)
- Lâmina maxima (y/D <= 0.75)
- Velocidade maxima (5.0 m/s)
- Declividade minima (I_min = 0.0055 * Qi^(-0.47))
- Diâmetro minimo de coletor (DN 150 mm)
- Recobrimento minimo (0.90 m sob rua, 0.65 m sob calcada)
- Espacamento maximo entre PVs (100 m)
- Coeficiente de Manning (n = 0.013)

### NBR 14486 (ABNT, 2000)

**Sistemas enterrados para conducao de esgoto sanitario -- Projeto de redes coletoras com tubos de PVC**

Complementa a NBR 9649 com especificacoes para tubulacao de PVC:
- Coeficiente de Manning para PVC novo (n = 0.010)
- Tensao trativa minima para PVC (0.6 Pa)
- Assentamento e berco de tubulacao

### NBR 12207 (ABNT, 1992)

**Projeto de interceptores de esgoto sanitario -- Procedimento**

Norma para interceptores (coletores de grande porte que recebem multiplos coletores). Referencia para futuras extensoes do URBANUS quando o pipeline precisar dimensionar trechos com DN > 600 mm.

## APIs e Fontes de Dados

### OpenStreetMap (Overpass API)

- Endpoint: `https://overpass-api.de/api/interpreter`
- Dados: malha viaria (highway=*) com geometria, nome, tipo de via
- Licenca: ODbL (Open Data Commons)
- Limitacoes: rate limit de ~10 req/min, timeout de 180s para consultas grandes

### OpenTopography API

- Endpoint: `https://portal.opentopography.org/API/globaldem`
- Dados: DEMs globais (COP30, NASADEM, FABDEM, etc.) em formato GeoTIFF
- Licenca: gratuito para uso academico com chave de API
- Limitacoes: area maxima por requisicao, rate limit

### USGS EarthExplorer

Fonte alternativa para DEMs SRTM e ASTER. Nao integrado diretamente, mas disponivel para download manual de DEMs de alta resolucao.

## Bibliotecas e Ferramentas

### Backend (Python)

| Biblioteca | Versao | Funcao |
|-----------|--------|--------|
| FastAPI | -- | Framework web assincrono |
| SQLAlchemy | -- | ORM com suporte async (asyncpg) |
| GeoAlchemy2 | -- | Tipos PostGIS para SQLAlchemy |
| Alembic | -- | Migracoes de banco de dados |
| NetworkX | -- | Modelagem e algoritmos de grafos |
| rasterio | -- | Leitura/escrita de rasters geoespaciais (GeoTIFF) |
| Pydantic | v2 | Validacao de dados e serializacao |
| httpx | -- | Cliente HTTP assincrono |
| uvicorn | -- | Servidor ASGI |
| Ruff | -- | Linter Python |

### Frontend (TypeScript)

| Biblioteca | Funcao |
|-----------|--------|
| Next.js 15 | Framework React (App Router) |
| React 19 | Biblioteca de UI |
| MapLibre GL JS | Renderizacao de mapas WebGL |
| react-map-gl | Bindings React para MapLibre |
| Zustand | Gerenciamento de estado |
| Immer | Atualizacoes imutaveis |
| TanStack Query | Cache e sincronizacao de dados do servidor |
| @turf/turf | Calculos geoespaciais no browser |
| Tailwind CSS | Estilizacao utility-first |
| shadcn/ui | Componentes de UI |
| Geist | Tipografia (Sans + Mono) |
| Sonner | Notificacoes toast |
| Turborepo | Orquestracao de monorepo |

### Infraestrutura

| Ferramenta | Funcao |
|-----------|--------|
| PostgreSQL 16 | Banco de dados relacional |
| PostGIS 3.4 | Extensao geoespacial |
| Docker Compose | Orquestracao de containers |
| pnpm | Gerenciador de pacotes JS |
| uv | Gerenciador de pacotes Python |
| GDAL | Biblioteca geoespacial C++ (dependencia de rasterio) |

### Validacao e Simulacao (Futuros)

| Ferramenta | Funcao |
|-----------|--------|
| SWMM (EPA) | Simulacao hidraulica e hidrologica de redes de drenagem e esgoto |
| OSMnx | Extracao e analise de redes viarias do OpenStreetMap |
| GeoPandas | DataFrames com geometria (Shapely + pandas) |
| Shapely | Operacoes geometricas 2D |
| WhiteboxTools | Analise de terreno (D8 flow direction, watershed) |
