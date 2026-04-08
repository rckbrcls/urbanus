# 13 -- Fluxo Completo do Pipeline com Links para o Codigo

## Objetivo

Este documento e um mapa rapido do pipeline inteiro, com links diretos para os arquivos e funcoes que participam de cada etapa.

Para a explicacao detalhada de cada fase, veja [05-pipeline-8-etapas.md](05-pipeline-8-etapas.md).

## Visao End-to-End

```text
streets_geojson / grafo editado
    -> build_graph_from_geojson / _build_graph_from_edited
    -> G (nx.Graph)
    -> classificacao e sanitizacao
    -> outlet + collection_points + mandatory
    -> rsph_sewer_routing
    -> tree (nx.DiGraph)
    -> resolve_low_points
    -> ensure_full_coverage
    -> _break_cycles
    -> optimize_node_placement
    -> dimension_network
    -> assign_accessory_types
    -> compute_total_cost
    -> save_sewer_network_to_postgis
    -> SewerNetwork
```

## Arquivo Orquestrador

- [`apps/api/src/urbanus_api/main.py`](../apps/api/src/urbanus_api/main.py)
- Endpoint principal: [`process_sewer_network`](../apps/api/src/urbanus_api/main.py)

## Fluxo Passo a Passo

| Ordem | Etapa | Entrada -> Saida | Arquivo | Funcao principal |
|------:|-------|------------------|---------|------------------|
| 0 | Construir grafo base | projeto / payload editado -> `G` | [`builder.py`](../apps/api/src/urbanus_api/core/graph/builder.py) / [`main.py`](../apps/api/src/urbanus_api/main.py) | [`build_graph_from_geojson`](../apps/api/src/urbanus_api/core/graph/builder.py), [`_build_graph_from_edited`](../apps/api/src/urbanus_api/main.py) |
| 0.5 | Corrigir elevacoes espurias | `G` -> `G` | [`main.py`](../apps/api/src/urbanus_api/main.py) | [`_sanitize_spurious_zero_elevations`](../apps/api/src/urbanus_api/main.py) |
| 1 | Extrair e classificar nos | GeoJSON -> nos classificados | [`classification.py`](../apps/api/src/urbanus_api/core/graph/classification.py) | [`extract_nodes`](../apps/api/src/urbanus_api/core/graph/classification.py) |
| 1.1 | Clustering espacial | nos -> nos consolidados | [`classification.py`](../apps/api/src/urbanus_api/core/graph/classification.py) | [`_cluster_nearby_nodes`](../apps/api/src/urbanus_api/core/graph/classification.py) |
| 1.5 | Marcar mudancas de direcao | `G` -> `G` | [`classification.py`](../apps/api/src/urbanus_api/core/graph/classification.py) | [`enforce_direction_changes`](../apps/api/src/urbanus_api/core/graph/classification.py) |
| 2 | Remover nos redundantes | `G` -> `G` | [`sanitization.py`](../apps/api/src/urbanus_api/core/graph/sanitization.py) | [`remove_redundant_nodes`](../apps/api/src/urbanus_api/core/graph/sanitization.py) |
| 3 | Resolver clusters de curva | `G` -> `G` | [`sanitization.py`](../apps/api/src/urbanus_api/core/graph/sanitization.py) | [`resolve_curve_clusters`](../apps/api/src/urbanus_api/core/graph/sanitization.py) |
| 4 | Enforce de espacamento minimo entre PVs | `G` -> `G` | [`sanitization.py`](../apps/api/src/urbanus_api/core/graph/sanitization.py) | [`enforce_min_pv_spacing`](../apps/api/src/urbanus_api/core/graph/sanitization.py) |
| 5 | Detectar extremos topograficos | `G` -> `G` | [`extrema.py`](../apps/api/src/urbanus_api/core/elevation/extrema.py) | [`detect_extrema`](../apps/api/src/urbanus_api/core/elevation/extrema.py) |
| 5.5 | Detectar quebra de greide | `G` -> `G` | [`sanitization.py`](../apps/api/src/urbanus_api/core/graph/sanitization.py) | [`detect_grade_breaks`](../apps/api/src/urbanus_api/core/graph/sanitization.py) |
| 6 | Recalcular `mandatory`, `outlet` e `collection_points` | `G` -> conjuntos de controle (com deduplicacao espacial dos low points) | [`main.py`](../apps/api/src/urbanus_api/main.py) | [`process_sewer_network`](../apps/api/src/urbanus_api/main.py) |
| 7 | Roteamento gravitacional | `G` + conjuntos -> `tree`, `unreachable` | [`rsph.py`](../apps/api/src/urbanus_api/core/routing/rsph.py) | [`rsph_sewer_routing`](../apps/api/src/urbanus_api/core/routing/rsph.py) |
| 7.1 | Calculo de custo do roteamento | aresta -> custo | [`cost.py`](../apps/api/src/urbanus_api/core/routing/cost.py) | [`edge_cost`](../apps/api/src/urbanus_api/core/routing/cost.py) |
| 8 | Resolver inalcançaveis | `tree` + `unreachable` -> `tree`, `pump_stations` | [`low_points.py`](../apps/api/src/urbanus_api/core/optimizer/low_points.py) | [`resolve_low_points`](../apps/api/src/urbanus_api/core/optimizer/low_points.py) |
| 9 | Garantir cobertura completa das ruas | `tree` + `G` -> `tree` | [`coverage.py`](../apps/api/src/urbanus_api/core/graph/coverage.py) | [`ensure_full_coverage`](../apps/api/src/urbanus_api/core/graph/coverage.py) |
| 10 | Quebrar ciclos | `tree` -> `tree` | [`main.py`](../apps/api/src/urbanus_api/main.py) | [`_break_cycles`](../apps/api/src/urbanus_api/main.py) |
| 11 | Otimizar numero de nos | `tree` -> `tree` | [`node_reduction.py`](../apps/api/src/urbanus_api/core/optimizer/node_reduction.py) | [`optimize_node_placement`](../apps/api/src/urbanus_api/core/optimizer/node_reduction.py) |
| 12 | Dimensionar hidraulica | `tree` -> `pipes` | [`dimensioning.py`](../apps/api/src/urbanus_api/core/hydraulics/dimensioning.py) | [`dimension_network`](../apps/api/src/urbanus_api/core/hydraulics/dimensioning.py) |
| 13 | Atribuir acessorios | `tree` + `pipes` -> `tree` anotado | [`accessories.py`](../apps/api/src/urbanus_api/core/graph/accessories.py) | [`assign_accessory_types`](../apps/api/src/urbanus_api/core/graph/accessories.py) |
| 14 | Calcular custo total | `pipes` + `pump_stations` + `tree` -> `float` | [`costing.py`](../apps/api/src/urbanus_api/core/hydraulics/costing.py) | [`compute_total_cost`](../apps/api/src/urbanus_api/core/hydraulics/costing.py) |
| 15 | Persistir resultado | `SewerNetwork` -> banco | [`builder.py`](../apps/api/src/urbanus_api/core/graph/builder.py) | [`save_sewer_network_to_postgis`](../apps/api/src/urbanus_api/core/graph/builder.py) |
| 16 | Serializar resposta | `tree` + `pipes` + `pump_stations` -> `SewerNetwork` | [`types.py`](../py/urbanus-geo/src/urbanus_geo/types.py) / [`main.py`](../apps/api/src/urbanus_api/main.py) | [`SewerNetwork`](../py/urbanus-geo/src/urbanus_geo/types.py) |

## Como Cada Modulo Participa

### `core/graph`

- [`builder.py`](../apps/api/src/urbanus_api/core/graph/builder.py): cria `G` e salva o resultado final.
- [`classification.py`](../apps/api/src/urbanus_api/core/graph/classification.py): define significado estrutural dos nos.
- [`sanitization.py`](../apps/api/src/urbanus_api/core/graph/sanitization.py): remove ruido topologico e marca eventos geometricos/topograficos.
- [`coverage.py`](../apps/api/src/urbanus_api/core/graph/coverage.py): garante que toda rua do grafo base apareca na rede final.
- [`accessories.py`](../apps/api/src/urbanus_api/core/graph/accessories.py): converte topologia final em acessorios de engenharia.

### `core/elevation`

- [`extrema.py`](../apps/api/src/urbanus_api/core/elevation/extrema.py): classifica maximos e minimos locais.

### `core/routing`

- [`rsph.py`](../apps/api/src/urbanus_api/core/routing/rsph.py): gera a espinha dorsal da rede dirigida.
- [`cost.py`](../apps/api/src/urbanus_api/core/routing/cost.py): define o custo da heuristica.

### `core/optimizer`

- [`low_points.py`](../apps/api/src/urbanus_api/core/optimizer/low_points.py): resolve o que o roteamento gravitacional nao conseguiu conectar.
- [`node_reduction.py`](../apps/api/src/urbanus_api/core/optimizer/node_reduction.py): reduz nos sem perder validade geometrica e hidraulica basica.

### `core/hydraulics`

- [`dimensioning.py`](../apps/api/src/urbanus_api/core/hydraulics/dimensioning.py): calcula DN, declividade, velocidade, tensao e profundidade.
- [`costing.py`](../apps/api/src/urbanus_api/core/hydraulics/costing.py): soma custo de tubos, escavacao e elevatorias.

## Objetos Que Mudam de Tipo ao Longo do Fluxo

| Momento | Tipo | Significado |
|--------|------|-------------|
| antes do roteamento | `nx.Graph` | malha viaria simplificada |
| depois do RSPH | `nx.DiGraph` | espinha dorsal do escoamento |
| depois da cobertura completa | `nx.DiGraph` | rede dirigida cobrindo a malha |
| depois da hidraulica | `nx.DiGraph` + `list[PipeSegment]` | rede com atributos de engenharia |
| resposta HTTP | `SewerNetwork` | modelo serializado para frontend e persistencia |

## Objetos de Controle Mais Importantes

| Nome | Onde nasce | Papel |
|------|------------|-------|
| `mandatory` | [`main.py`](../apps/api/src/urbanus_api/main.py) | nos que o roteamento precisa conectar |
| `outlet` | [`main.py`](../apps/api/src/urbanus_api/main.py) | exutorio global do sistema |
| `collection_points` | [`main.py`](../apps/api/src/urbanus_api/main.py) | sumidouros locais usados pelo RSPH |
| `unreachable` | [`rsph.py`](../apps/api/src/urbanus_api/core/routing/rsph.py) | nos obrigatorios sem caminho gravitacional |
| `pump_stations` | [`low_points.py`](../apps/api/src/urbanus_api/core/optimizer/low_points.py) | elevatorias adicionadas apos o roteamento |
| `pipes` | [`dimensioning.py`](../apps/api/src/urbanus_api/core/hydraulics/dimensioning.py) | resultado do dimensionamento de cada trecho |

## O Que Nao Esta no Fluxo Principal Hoje

Estas funcoes existem, mas nao sao chamadas pelo endpoint atual:

- [`sanitize_long_edges`](../apps/api/src/urbanus_api/core/graph/sanitization.py)
- [`subdivide_steep_edges`](../apps/api/src/urbanus_api/core/graph/sanitization.py)

## Ordem Recomendada de Leitura

1. [`main.py`](../apps/api/src/urbanus_api/main.py)
2. [`builder.py`](../apps/api/src/urbanus_api/core/graph/builder.py)
3. [`classification.py`](../apps/api/src/urbanus_api/core/graph/classification.py)
4. [`sanitization.py`](../apps/api/src/urbanus_api/core/graph/sanitization.py)
5. [`extrema.py`](../apps/api/src/urbanus_api/core/elevation/extrema.py)
6. [`rsph.py`](../apps/api/src/urbanus_api/core/routing/rsph.py)
7. [`low_points.py`](../apps/api/src/urbanus_api/core/optimizer/low_points.py)
8. [`coverage.py`](../apps/api/src/urbanus_api/core/graph/coverage.py)
9. [`node_reduction.py`](../apps/api/src/urbanus_api/core/optimizer/node_reduction.py)
10. [`dimensioning.py`](../apps/api/src/urbanus_api/core/hydraulics/dimensioning.py)
11. [`accessories.py`](../apps/api/src/urbanus_api/core/graph/accessories.py)
