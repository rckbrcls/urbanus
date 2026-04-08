# 05 -- Pipeline de Processamento

## Objetivo

Este documento descreve o pipeline real executado hoje por `POST /projects/{id}/process`.

A simplificacao atual removeu o fallback historico que reconstruia o grafo a partir de `streets_geojson`. O endpoint trabalha somente com o grafo editado enviado pelo frontend (`nodes` + `edges`).

## Entrada e saida

### Entrada

- `project_id`
- body JSON obrigatorio com `nodes` e `edges`

### Saida

- `SewerNetwork`
  - `nodes`
  - `edges`
  - `pipes`
  - `pump_stations`
  - `unreachable_nodes`
  - `total_cost`

## Representacoes internas

1. `G: nx.Graph`
   grafo viario editado, nao direcionado
2. `tree: nx.DiGraph`
   rede dirigida no sentido do escoamento
3. `SewerNetwork`
   payload serializado para frontend e persistencia

## Sequencia atual

```text
grafo editado
  -> _build_graph_from_edited
  -> _sanitize_spurious_zero_elevations
  -> enforce_direction_changes
  -> remove_redundant_nodes
  -> resolve_curve_clusters
  -> enforce_min_pv_spacing
  -> detect_extrema
  -> detect_grade_breaks
  -> selecionar outlet + collection_points
  -> rsph_sewer_routing
  -> resolve_low_points
  -> ensure_full_coverage
  -> _break_cycles (se necessario)
  -> optimize_node_placement
  -> dimension_network
  -> assign_accessory_types
  -> compute_total_cost
  -> save_sewer_network_to_postgis
  -> SewerNetwork
```

## Etapas

### 0. Reconstrucao de `G`

Arquivo: `apps/api/src/urbanus_api/main.py`

- o body e obrigatorio
- o backend cria `G` apenas a partir de `nodes` e `edges`
- payload vazio, sem arestas validas ou com referencias a nos inexistentes retorna `400`

### 0.5. Saneamento de elevacoes espurias

Arquivo: `apps/api/src/urbanus_api/main.py`

- substitui `z=0` por `None` quando o contexto local indica artefato de DEM

### 1. Marcacao estrutural

Arquivo: `core/graph/classification.py`

- reforca `pv_obrigatorio`
- marca mudancas de direcao acima de 45 graus

### 2. Sanitizacao topologica

Arquivo: `core/graph/sanitization.py`

- `remove_redundant_nodes`
- `resolve_curve_clusters`
- `enforce_min_pv_spacing`
- `detect_grade_breaks`

### 3. Extremos

Arquivo: `core/elevation/extrema.py`

- identifica maximos/minimos locais relevantes para o roteamento

### 4. Controle de roteamento

Arquivo: `main.py`

- recalcula `mandatory`
- escolhe `outlet`
- respeita `is_collection_point` vindo do frontend quando existir
- sem marcacao manual, usa low points automaticos deduplicados espacialmente

### 5. RSPH

Arquivo: `core/routing/rsph.py`

- gera a espinha dorsal gravitacional
- devolve `tree` e `unreachable`

### 6. Low points e cobertura

Arquivos:

- `core/optimizer/low_points.py`
- `core/graph/coverage.py`

- conecta trechos inalcanhaveis com elevatorias quando necessario
- garante cobertura completa da malha representada por `G`

### 7. Estabilidade e compressao

Arquivos:

- `main.py`
- `core/optimizer/node_reduction.py`

- quebra ciclos remanescentes
- reduz quantidade de nos sem perder validade operacional
- quando um no e removido por compressao, a aresta resultante nao herda a
  coordenada do no removido como `waypoint`; a geometria renderizada passa a
  refletir imediatamente a topologia final simplificada

### 8. Hidraulica e acessorios

Arquivos:

- `core/hydraulics/dimensioning.py`
- `core/hydraulics/costing.py`
- `core/graph/accessories.py`

- dimensiona os tubos
- classifica todos os nos fisicos como PV
- destaca pontos de coleta separadamente via `is_collection_point`
- calcula custo total

### 9. Persistencia

Arquivo: `data/repositories.py`

- salva a `SewerNetwork` nas tabelas do PostGIS
- atualiza o snapshot `_sewerNetwork` dentro do projeto

## Invariantes importantes

- o endpoint nao reconstrui mais `G` a partir de ruas salvas
- o frontend e o contrato de verdade para o grafo processado
- `sewerNetwork` salvo continua sendo a fonte de reidratacao do editor apos reload
