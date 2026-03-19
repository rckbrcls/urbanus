# 05 -- Pipeline de Processamento (8 Etapas)

## Visao Geral

O pipeline de processamento transforma um grafo viario com elevacao em uma rede coletora de esgoto dimensionada. E executado via `POST /projects/{project_id}/process` e segue 8 etapas sequenciais.

```
Grafo viario     Etapas 1-4       Etapa 5        Etapa 6         Etapa 7        Etapa 8
(PostGIS)   -->  Classificacao --> Elevacao   --> Roteamento  --> Otimizacao --> Dimensionamento
                 + sanitizacao    extrema        gravitacional   pontos baixos  hidraulico
                                                 (RSPH)                         (NBR 9649)
                                                     |
                                                     v
                                              SewerNetwork
                                              (nos, arestas, tubos,
                                               elevatorias, inalcancaveis)
```

## Fluxo de Execucao (`main.py`)

```python
# 1. Carregar grafo do PostGIS
G = await build_graph_from_postgis(project_id, session)

# 2-4. Sanitizacao
G = sanitize_long_edges(G)
G = remove_redundant_nodes(G)
G = resolve_curve_clusters(G)

# 5. Elevacao
G = detect_extrema(G)

# 6. Roteamento
mandatory = {n for n, d in G.nodes(data=True) if d.get("pv_obrigatorio")}
outlet = min(G.nodes, key=lambda n: G.nodes[n].get("z", float("inf")))
tree, unreachable = rsph_sewer_routing(G, outlet, mandatory)

# 7. Otimizacao
tree, pumps = resolve_low_points(tree, unreachable, G, outlet)

# 8. Dimensionamento
pipes = dimension_network(tree)

# Salvar e retornar
await save_graph_to_postgis(project_id, tree, session)
```

---

## Etapa 1: Classificacao de Nos Obrigatorios

**Arquivo**: `core/graph/classification.py`
**Funcao**: `extract_nodes(geojson, mode)`

### Objetivo

Identificar nos que devem obrigatoriamente receber um Poco de Visita (PV) na rede de esgoto. Esses nos sao marcados como ROSA.

### Algoritmo

```
Para cada coordenada no GeoJSON:
    pos_key = f"{lat:.6f},{lng:.6f}"
    Agregar: street_ids, street_names
    degree = |street_ids|

Para cada vertice:
    is_intersection = degree >= 2
    is_endpoint = primeiro ou ultimo vertice da LineString
    elevation = vertex_elevations[i] ou None

    SE is_intersection OU is_endpoint:
        node_type = "ROSA"
        pv_obrigatorio = True
    SE queda de elevacao > 0.50 m entre vertices adjacentes:
        node_type = "ROSA"
        pv_obrigatorio = True

    (filtrar por mode: "intersections" -> degree >= 2 ou endpoint)

Pos-processamento:
    highest_id = argmax(elevation) entre intersecoes -> "AMARELO" (se nao ROSA)
    lowest_id = argmin(elevation) entre intersecoes -> "AZUL_ESCURO" (se nao ROSA)
```

### Saida

```python
{
    "nodes": [
        {
            "id": "uuid",
            "position": {"lat": float, "lng": float},
            "elevation": float | None,
            "degree": int,
            "isIntersection": bool,
            "isEndpoint": bool,
            "connectedStreets": [str],
            "nodeType": "ROSA" | "AMARELO" | "AZUL_ESCURO" | None,
            "pvObrigatorio": bool,
            "accessoryType": "PV" | None
        }
    ],
    "metadata": {
        "totalVertices": int,
        "totalUniquePositions": int,
        "filteredNodes": int,
        "highestElevationNodeId": str | None,
        "lowestElevationNodeId": str | None
    }
}
```

### Complexidade

O(V) onde V = numero de vertices no GeoJSON. A agregacao de coordenadas usa dicionario com chave de string formatada.

---

## Etapa 2: Subdivisao de Arestas Longas

**Arquivo**: `core/graph/sanitization.py`
**Funcao**: `sanitize_long_edges(G, dist_max=LONG_EDGE_MAX_DISTANCE)`
**Constante**: `LONG_EDGE_MAX_DISTANCE = 100 m`

### Objetivo

Subdividir arestas com comprimento superior a `dist_max` em segmentos menores. Nos intermediarios recebem tipo VERDE.

### Algoritmo

```
Para cada aresta (u, v) com length > dist_max:
    n_segments = ceil(length / dist_max)
    n_novos_nos = n_segments - 1

    Para i de 1 ate n_novos_nos:
        t = i / n_segments
        lat_i = lerp(lat_u, lat_v, t)
        lng_i = lerp(lng_u, lng_v, t)
        z_i   = lerp(z_u, z_v, t)

        Criar no intermediario (node_type="VERDE")

    Substituir aresta (u, v) por cadeia:
        u -> n1 -> n2 -> ... -> v
```

### Parametros

| Parametro | Valor | Descricao |
|-----------|-------|-----------|
| `dist_max` | 100 m | Comprimento maximo de aresta |

### Complexidade

O(E) onde E = numero de arestas. Cada aresta e avaliada uma vez.

---

## Etapa 3: Remocao de Nos Redundantes

**Arquivo**: `core/graph/sanitization.py`
**Funcao**: `remove_redundant_nodes(G, dist_min, dist_max)`
**Constantes**: `REDUNDANT_NODE_MIN_DISTANCE = 20 m`, `LONG_EDGE_MAX_DISTANCE = 100 m`

### Objetivo

Remover nos de grau 2 que estao muito proximos de ambos os vizinhos (sem contribuicao topologica). Nos removidos sao marcados como VERMELHO.

### Restricoes

- Nunca remover nos com `pv_obrigatorio = True`
- Apenas nos com `degree == 2`
- Ambos os vizinhos devem estar a menos de `dist_min` de distancia
- A aresta resultante da fusao nao pode exceder `dist_max`

### Algoritmo

```
Repetir ate estabilizar:
    Para cada no n com grau == 2 e pv_obrigatorio == False:
        Vizinhos: n1, n2
        d1 = haversine(n, n1)
        d2 = haversine(n, n2)

        SE d1 < dist_min E d2 < dist_min E (d1 + d2) <= dist_max:
            Marcar n como VERMELHO
            Remover n
            Criar aresta (n1, n2) com length = d1 + d2
```

### Complexidade

O(V * k) onde k = numero de iteracoes ate estabilizar (tipicamente 2-3).

---

## Etapa 4: Resolucao de Clusters de Curva

**Arquivo**: `core/graph/sanitization.py`
**Funcao**: `resolve_curve_clusters(G, angle_threshold=CURVE_ANGLE_THRESHOLD)`
**Constante**: `CURVE_ANGLE_THRESHOLD = 150 graus`

### Objetivo

Substituir nos em curvas acentuadas por nos otimizados na intersecao das tangentes. Se o angulo no no e menor que o limiar, a curva e considerada acentuada e justifica um PV.

### Algoritmo

```
Repetir ate estabilizar:
    Para cada no n com grau == 2:
        Vizinhos: n1, n2
        angulo = angle_at_node(n1, n, n2)

        SE angulo < angle_threshold:
            P = line_intersection(tangente n1->n, tangente n->n2)
            SE P != None:
                z_novo = media(z_n1, z_n2)
                Substituir n por novo no VERDE em P
                Interpolar elevacao
```

### Funcoes Auxiliares

- `angle_at_node(a, b, c)`: calcula angulo interior em B entre segmentos BA e BC (graus, [0, 180])
- `line_intersection(a, b, c, d)`: intersecao parametrica de retas L1(A->B) e L2(C->D), retorna ponto ou None se paralelas

### Complexidade

O(V) por iteracao, tipicamente 1-2 iteracoes.

---

## Etapa 5: Deteccao de Extremos de Elevacao

**Arquivo**: `core/elevation/extrema.py`
**Funcao**: `detect_extrema(G, epsilon=0.5, min_prominence=ELEVATION_PROMINENCE_MIN)`
**Constante**: `ELEVATION_PROMINENCE_MIN = 2.0 m`

### Objetivo

Identificar maximos locais (AMARELO) e minimos locais (AZUL_ESCURO) significativos no perfil topografico da rede.

### Algoritmo

```
Para cada no n com elevacao z:
    SE pv_obrigatorio: pular

    vizinhos_z = [z_v para v em vizinhos(n)]

    SE todos(z_v < z - epsilon para z_v em vizinhos_z):
        # Maximo local
        prom = compute_prominence(G, n, z, direction="down")
        SE prom >= min_prominence:
            n.node_type = "AMARELO"

    SE todos(z_v > z + epsilon para z_v em vizinhos_z):
        # Minimo local
        prom = compute_prominence(G, n, z, direction="up")
        SE prom >= min_prominence:
            n.node_type = "AZUL_ESCURO"
```

### Proeminencia Topografica

A proeminencia mede a "importancia" de um pico ou vale. E calculada via BFS a partir do no ate `max_hops = 20`:

- **Para maximos (direction="down")**: proeminencia = z_pico - z_sela, onde z_sela e o ponto mais alto que voce deve cruzar para alcancar um pico mais alto
- **Para minimos (direction="up")**: proeminencia = z_sela - z_vale

Apenas extremos com proeminencia >= 2.0 m sao marcados, eliminando ruido do DEM.

### Complexidade

O(V * H) onde H = max_hops (20). O BFS e limitado em profundidade.

---

## Etapa 6: Roteamento Gravitacional (RSPH)

**Arquivo**: `core/routing/rsph.py`
**Funcao**: `rsph_sewer_routing(G, outlet, mandatory_nodes)`

### Objetivo

Construir uma arborescencia (arvore orientada) que conecta todos os nos obrigatorios ao exutorio (no de menor elevacao) usando caminhos gravitacionais (alto -> baixo).

### Algoritmo: Repeated Shortest Path Heuristic

```
1. Criar grafo direcionado D:
   Para cada aresta nao-direcionada (u, v):
       SE z_u >= z_v: adicionar u -> v em D
       SE z_v >= z_u: adicionar v -> u em D
       SE sem elevacao: adicionar ambas direcoes

2. Inicializar arvore T com no exutorio
   reused_edges = {}

3. Ordenar nos obrigatorios por elevacao decrescente (mais altos primeiro)

4. Para cada no obrigatorio m:
       caminho = Dijkstra(D, m, exutorio, peso=edge_cost)
       SE caminho encontrado:
           Adicionar todas arestas do caminho a T
           Marcar arestas como reusadas em reused_edges
       SENAO:
           Adicionar m a lista de inalcancaveis

5. Retornar (T, inalcancaveis)
```

### Funcao de Custo (`cost.py`)

```
C_total = (C_pipe + C_excavation + C_slope) * discount

C_pipe = PIPE_UNIT_COST * length

C_excavation = (EXCAVATION_A_COEF * depth^2 + EXCAVATION_B_COEF * depth) * length
    onde depth = MIN_COVER_STREET (0.90 m)

C_slope:
    SE z_u e z_v disponiveis:
        s = slope_2d(z_u, z_v, length)
        SE s <= 0:           PUMP_PENALTY (100000)
        SE 0 < s < 0.005:   SLOPE_PENALTY * (0.005 - s) / 0.005 * length
        SENAO:               0
    SENAO:
        SLOPE_PENALTY * length * 0.5

discount:
    SE (u, v) em reused_edges: REUSE_BONUS (0.5)
    SENAO: 1.0
```

A funcao de custo penaliza fortemente fluxo contra a gravidade (`PUMP_PENALTY`) e declividades insuficientes, enquanto bonifica a reutilizacao de trechos ja incorporados na arvore (`REUSE_BONUS`).

### Por que processar os mais altos primeiro?

Nos de maior elevacao tendem a ter caminhos gravitacionais mais longos ate o exutorio. Processando-os primeiro, seus caminhos sao incorporados na arvore e podem ser reutilizados (com bonus de custo) por nos subsequentes, resultando em redes mais compactas.

### Alternativa: Edmonds/Chu-Liu (`arborescence.py`)

O algoritmo de Edmonds encontra a **arborescencia de custo minimo** (solucao otima), em contraste com a heuristica RSPH. A implementacao usa `networkx.minimum_spanning_arborescence()`.

Desvantagens:
- Nao permite bonus de reutilizacao
- Pode produzir redes com muitas ramificacoes
- Maior complexidade computacional: O(V * E)

### Complexidade do RSPH

O(M * (V + E) * log V) onde M = numero de nos obrigatorios (Dijkstra para cada um).

---

## Etapa 7: Resolucao de Pontos Baixos

**Arquivo**: `core/optimizer/low_points.py`
**Funcao**: `resolve_low_points(tree, unreachable, G, outlet)`

### Objetivo

Para cada no inalcancavel (sem caminho gravitacional ate o exutorio), avaliar tres opcoes e escolher a de menor custo.

### Algoritmo

```
Para cada no inalcancavel n:
    Opcao A: Rota alternativa gravitacional
        custo_A = Dijkstra(G, n, arvore_mais_proximo, peso=edge_cost)

    Opcao B: Escavacao profunda
        custo_B = EXCAVATION_A_COEF * d^2 + EXCAVATION_B_COEF * d
        onde d = profundidade adicional necessaria

    Opcao C: Elevatoria (bombeamento)
        capacidade = 7.5 L/s
        altura = MAX_GRAVITY_DEPTH (4.5 m)
        CAPEX = PUMP_CAPEX_MIN (150000 R$)
        OPEX_anual = 5% * CAPEX
        custo_C = pump_npv(CAPEX, OPEX_anual, 20 anos, 10%)

    Escolher min(custo_A, custo_B, custo_C):
        SE rota: adicionar caminho a arvore
        SE elevatoria: criar PumpStation + aresta pressurizada
        SE escavacao: atribuir extra_depth ao no
```

### Saida

- Arvore atualizada com novos caminhos ou arestas pressurizadas
- Lista de `PumpStation` com CAPEX, OPEX e VPL

### Complexidade

O(U * (V + E) * log V) onde U = numero de nos inalcancaveis.

---

## Etapa 8: Dimensionamento Hidraulico (NBR 9649)

**Arquivo**: `core/hydraulics/dimensioning.py`
**Funcao**: `dimension_network(tree, population_per_node=50.0)`

### Objetivo

Selecionar diâmetro, verificar lâmina, velocidade e tensao trativa para cada trecho da rede, conforme NBR 9649.

### Algoritmo

```
1. Ordenacao topologica (folhas -> raiz)
2. Acumular populacao a montante para cada aresta

3. Para cada aresta (u, v) na arvore:
    SE pressurizada: pular

    s = slope_2d(z_u, z_v, length) ou 0.005 (default)
    pop = upstream_count * population_per_node
    q_d = sewage_flow_estimate(pop)
    q_peak = peak_flow(q_d)
    q_design = max(q_peak, MIN_FLOW_RATE)

    i_min = min_slope(q_design)    # 0.0055 * Qi^(-0.47)
    slope_used = max(s, i_min)

    diametro = _select_diameter(slope_used, q_design)
```

### Selecao de Diâmetro (`_select_diameter`)

```
Para DN em PIPE_DIAMETERS [100, 150, 200, ..., 1000]:
    Busca binaria por y/D que produz q_design:
        rh = hydraulic_radius_partial(DN, y)
        V = manning_velocity(rh, slope, n=0.013)
        A = area da secao circular parcial
        Q = A * V

    Verificar restricoes:
        tau = tractive_stress(rh, slope) >= 1.0 Pa
        y/D <= 0.75
        V <= 5.0 m/s

    Retornar primeiro DN que satisfaz todas as restricoes

Fallback: maior diâmetro disponivel
```

### Saida

Lista de `PipeSegment` com:
- `diameter_mm`: diâmetro nominal selecionado
- `manning_n`: 0.013
- `slope`: declividade usada
- `cover_depth`: recobrimento
- `flow_depth_ratio`: y/D
- `velocity`: m/s
- `tractive_stress`: Pa
- `flow_rate`: L/s

### Complexidade

O(E * D * log(P)) onde E = arestas, D = diâmetros candidatos (10), P = precisao da busca binaria.
