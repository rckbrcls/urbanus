# 00 -- Visao Geral do Produto

## O que e o URBANUS

O URBANUS e uma plataforma web para planejamento automatizado de redes coletoras de esgoto sanitario. A partir de uma area selecionada no mapa, o sistema:

1. Extrai a malha viaria de fontes abertas (OpenStreetMap via Overpass API)
2. Enriquece as geometrias com dados de elevacao (OpenTopography)
3. Identifica nos obrigatorios (intersecoes, extremidades, mudancas bruscas de cota)
4. Executa um pipeline de 8 etapas que classifica, sanitiza, roteia e dimensiona a rede de esgoto
5. Apresenta o resultado como um grafo editavel interativo sobre o mapa

O objetivo e substituir o processo manual de tracado de rede -- tradicionalmente feito com CAD e planilhas -- por uma ferramenta que combina algoritmos de otimizacao de grafos com dimensionamento hidraulico segundo a NBR 9649.

## Objetivo Academico

O projeto e desenvolvido como trabalho de Iniciacao Cientifica (IC). O escopo academico compreende:

- Formulacao do problema de tracado de rede como um problema de arborescencia de custo minimo em grafo ponderado
- Implementacao de heuristicas (RSPH -- Repeated Shortest Path Heuristic) e algoritmos exatos (Edmonds/Chu-Liu)
- Dimensionamento hidraulico automatizado com verificacao de tensao trativa, lâmina d'agua e velocidade maxima
- Integracao com dados geoespaciais abertos (OSM, DEMs globais) para eliminacao de levantamento topografico preliminar
- Comparacao com ferramentas existentes (pysewer, QEsg, saniHUB)

## Stack Tecnologica

| Camada | Tecnologia | Funcao |
|--------|-----------|--------|
| Frontend | Next.js 15 (App Router) | Interface web, renderizacao hibrida |
| Mapa | MapLibre GL JS + react-map-gl | Renderizacao WebGL, edicao interativa |
| Estado | Zustand + Immer | Stores reativos com atualizacao imutavel |
| Backend | FastAPI (Python) | API REST, pipeline de processamento |
| Banco | PostgreSQL 16 + PostGIS 3.4 | Armazenamento espacial, indices GIST |
| Grafos | NetworkX | Modelagem de grafos, Dijkstra, arborescencia |
| Elevacao | rasterio + OpenTopography API | Download e amostragem de DEMs (GeoTIFF) |
| Tipos (JS) | `@urbanus/geo` | Tipos canonicos LatLng, SewerNode, etc. |
| Tipos (Python) | `urbanus-geo` | Equivalentes Pydantic + formulas hidraulicas |
| Build | Turborepo + pnpm + uv | Monorepo poliglota JS/TS + Python |
| Infra | Docker Compose | Orquestracao local (client, server, postgres) |

## Arquitetura de Alto Nivel

```
+------------------+     +------------------+     +---------------------+
|                  |     |                  |     |                     |
|  Browser         |     |  Next.js         |     |  FastAPI            |
|  (MapLibre GL)   +---->+  (App Router)    +---->+  (Python)           |
|                  |     |  API Routes      |     |                     |
|  - Edicao de     |     |  /api/streets    |     |  /elevation/enrich  |
|    grafos        |     |  /api/elevation  |     |  /nodes/extract     |
|  - Zustand       |     |  /api/topography |     |  /projects/{id}/    |
|    stores        |     |  /api/nodes      |     |    process          |
|  - Command       |     |                  |     |                     |
|    Pattern       |     +--------+---------+     +----------+----------+
|                  |              |                           |
+------------------+              |                           |
                                  |                           |
                    +-------------v---------------------------v---------+
                    |                                                    |
                    |  PostgreSQL 16 + PostGIS 3.4                      |
                    |                                                    |
                    |  projects | nodes | edges | pipe_segments |        |
                    |  pump_stations                                     |
                    |  Geometry (POINT, LINESTRING, POLYGON) SRID 4326  |
                    |  Indices GiST espaciais                           |
                    +----------------------------------------------------+
                                  ^                           ^
                                  |                           |
                    +-------------+----------+  +-------------+----------+
                    |                        |  |                        |
                    |  OpenStreetMap         |  |  OpenTopography        |
                    |  (Overpass API)        |  |  (GeoTIFF DEMs)       |
                    |  Malha viaria          |  |  COP30, NASADEM       |
                    +------------------------+  +------------------------+
```

## Fluxo Completo do Usuario

### Fase 1: Selecao de Area e Aquisicao de Dados

1. O usuario abre o mapa (MapLibre GL JS, renderizado client-side via `dynamic()` com `ssr: false`)
2. Com Shift + Drag, desenha um retangulo (bounding box) sobre a area de interesse
3. O `BboxDrawControl` valida a area (minimo 0.001 km², maximo 100 km²)
4. Ao confirmar, o `areaSelectionStore` inicia o processamento em 3 estagios:
   - **Estagio 1 -- Ruas**: `POST /api/streets` consulta a Overpass API e retorna GeoJSON de vias
   - **Estagio 2 -- Topografia**: `POST /api/elevation/enrich` faz proxy para o FastAPI, que baixa GeoTIFF do OpenTopography e amostra elevacoes nos vertices das LineStrings
   - **Estagio 3 -- Nos**: `POST /api/nodes/extract` faz proxy para o FastAPI, que classifica os nos (ROSA para obrigatorios, AMARELO/AZUL_ESCURO para extremos de elevacao)

### Fase 2: Edicao Interativa do Grafo

5. O usuario salva o projeto, que e persistido no PostGIS
6. No editor de grafos (`ProjectEditor`), os nos e arestas sao carregados como `NetworkGraph`
7. O usuario pode editar a rede em 6 modos: select, move, add-node, add-edge, delete, split-edge
8. Cada edicao gera um `GraphCommand` que suporta undo/redo (pilha de 100 acoes)
9. Nos adicionados fazem snapping inteligente para ruas ou nos existentes

### Fase 3: Processamento e Dimensionamento

10. `POST /projects/{id}/process` dispara o pipeline de 8 etapas no backend:
    - Etapas 1-4: classificacao, subdivisao de arestas, remocao de redundancias, resolucao de curvas
    - Etapa 5: deteccao de maximos/minimos topograficos
    - Etapa 6: roteamento gravitacional (RSPH) de todos os nos ate o exutorio
    - Etapa 7: resolucao de pontos baixos (rota alternativa, escavacao extra ou elevatoria)
    - Etapa 8: dimensionamento hidraulico NBR 9649 (diâmetro, lâmina, velocidade, tensao trativa)
11. O resultado (`SewerNetwork`) e exibido no mapa com setas de fluxo e propriedades nos paineis laterais
