# 13 -- Fluxo Completo do Pipeline

## Visao end-to-end

```text
frontend edited graph
  -> _build_graph_from_edited
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

## Arquivo orquestrador

- `apps/api/src/urbanus_api/main.py`

## Mapa rapido das etapas

| Ordem | Etapa | Entrada -> Saida | Arquivo | Funcao |
|------:|-------|------------------|---------|--------|
| 0 | Construir grafo | payload editado -> `G` | `main.py` | `_build_graph_from_edited` |
| 0.5 | Corrigir elevacoes espurias | `G` -> `G` | `main.py` | `_sanitize_spurious_zero_elevations` |
| 1 | Marcar mudancas de direcao | `G` -> `G` | `classification.py` | `enforce_direction_changes` |
| 2 | Sanitizar topologia | `G` -> `G` | `sanitization.py` | `remove_redundant_nodes`, `resolve_curve_clusters`, `enforce_min_pv_spacing`, `detect_grade_breaks` |
| 3 | Detectar extremos | `G` -> `G` | `extrema.py` | `detect_extrema` |
| 4 | Escolher controles de roteamento | `G` -> conjuntos auxiliares | `main.py` | `process_sewer_network` |
| 5 | Roteamento gravitacional | `G` -> `tree`, `unreachable` | `rsph.py` | `rsph_sewer_routing` |
| 6 | Resolver low points | `tree` -> `tree`, `pump_stations` | `low_points.py` | `resolve_low_points` |
| 7 | Garantir cobertura | `tree` + `G` -> `tree` | `coverage.py` | `ensure_full_coverage` |
| 8 | Quebrar ciclos | `tree` -> `tree` | `main.py` | `_break_cycles` |
| 9 | Reduzir nos | `tree` -> `tree` | `node_reduction.py` | `optimize_node_placement` |
| 10 | Dimensionar hidraulica | `tree` -> `pipes` | `dimensioning.py` | `dimension_network` |
| 11 | Atribuir acessorios | `tree` + `pipes` -> `tree` | `accessories.py` | `assign_accessory_types` |
| 12 | Calcular custo total | `pipes` + `pump_stations` + `tree` -> `float` | `costing.py` | `compute_total_cost` |
| 13 | Persistir resultado | `SewerNetwork` -> banco | `repositories.py` | `save_sewer_network_to_postgis` |
| 14 | Responder ao frontend | objetos processados -> `SewerNetwork` | `main.py` | `process_sewer_network` |

## Leituras recomendadas

1. `apps/api/src/urbanus_api/main.py`
2. `apps/api/src/urbanus_api/core/graph/classification.py`
3. `apps/api/src/urbanus_api/core/graph/sanitization.py`
4. `apps/api/src/urbanus_api/core/elevation/extrema.py`
5. `apps/api/src/urbanus_api/core/routing/rsph.py`
6. `apps/api/src/urbanus_api/core/optimizer/low_points.py`
7. `apps/api/src/urbanus_api/core/graph/coverage.py`
8. `apps/api/src/urbanus_api/core/optimizer/node_reduction.py`
9. `apps/api/src/urbanus_api/core/hydraulics/dimensioning.py`
10. `apps/api/src/urbanus_api/core/graph/accessories.py`
