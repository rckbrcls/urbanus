# Documento técnico para o algoritmo de planejamento de rede de esgoto URBANUS

O sistema URBANUS pode gerar redes de esgoto ótimas combinando um pipeline de sanitização de grafos em 8 etapas com roteamento gravitacional baseado em arborescência de custo mínimo (Edmonds' algorithm), validado por fórmulas hidráulicas da NBR 9649. Este documento detalha cada algoritmo, fórmula e decisão arquitetural necessários para implementação completa no backend FastAPI/Python. A abordagem recomendada — **Repeated Shortest Path Heuristic (RSPH)** para layout, combinada com programação dinâmica para dimensionamento hidráulico — é comprovada pelo projeto open-source **pysewer** (UFZ, 2024) e pela literatura acadêmica recente (Duque et al. 2020, Saldarriaga et al. 2021), produzindo economias de **30-40%** em relação a projetos manuais.

---

## 1. Pipeline completo do algoritmo: da rua ao esgoto

O algoritmo opera em **8 etapas sequenciais** sobre o grafo `G = (V, E)` onde cada nó `v ∈ V` possui atributos `(x, y, z, tipo)` e cada aresta `e ∈ E` possui `(comprimento, declividade, geometria)`. O grafo inicial é não-direcionado (todas as rotas possíveis), convertido em direcionado após definição do fluxo gravitacional.

### Etapa 1 — Detecção de nós obrigatórios (rosa)

Nós com **grau ≥ 2** no grafo original (interseções de ruas) recebem Poço de Visita (PV) obrigatório. Também são obrigatórios nós em: mudanças de direção > 45°, quedas > 0,50m, reunião de > 2 coletores e extremidades de rede (conforme NBR 9649 §5.2.6). A detecção usa o critério de Boeing (2025) para "true endpoints" — nós com grau ≠ 2, self-loops ou transições de atributos, idêntico ao algoritmo de simplificação do OSMnx.

```python
def classify_mandatory_nodes(G):
    for node in G.nodes():
        degree = G.degree(node)
        if degree >= 2 or degree == 0:  # interseção ou endpoint
            G.nodes[node]['tipo'] = 'ROSA'
            G.nodes[node]['pv_obrigatorio'] = True
```

**Complexidade:** O(|V| + |E|). **Saída:** conjunto `V_obrigatorio` de nós imutáveis.

### Etapa 2 — Sanitização de arestas longas (nós verdes)

Arestas maiores que `dist_max` (padrão: **100m**, configurável 80-120m por município) são subdivididas com nós intermediários. A elevação é interpolada linearmente.

```python
def sanitize_long_edges(G, dist_max=100.0):
    edges_to_process = [(u, v) for u, v in G.edges() 
                        if G[u][v]['length'] > dist_max]
    for u, v in edges_to_process:
        L = G[u][v]['length']
        n_segments = math.ceil(L / dist_max)
        G.remove_edge(u, v)
        prev = u
        for i in range(1, n_segments):
            t = i / n_segments
            x_new = G.nodes[u]['x'] + t * (G.nodes[v]['x'] - G.nodes[u]['x'])
            y_new = G.nodes[u]['y'] + t * (G.nodes[v]['y'] - G.nodes[u]['y'])
            z_new = G.nodes[u]['z'] + t * (G.nodes[v]['z'] - G.nodes[u]['z'])
            new_id = f"green_{u}_{v}_{i}"
            G.add_node(new_id, x=x_new, y=y_new, z=z_new, tipo='VERDE')
            G.add_edge(prev, new_id, length=L/n_segments)
            prev = new_id
        G.add_edge(prev, v, length=L/n_segments)
```

**Complexidade:** O(|E| × L_max / dist_max). Para uma rede urbana típica (10.000 arestas, comprimento médio 120m), gera ~2.000 novos nós.

### Etapa 3 — Remoção de nós redundantes (nós vermelhos)

Nós muito próximos (< `dist_min`, tipicamente **20m**) são removidos, mantendo apenas o mais próximo do limite `dist_max`. O algoritmo percorre cadeias de nós grau-2 entre interseções.

```python
def remove_redundant_nodes(G, dist_min=20.0, dist_max=100.0):
    for chain in find_degree2_chains(G):
        kept = [chain[0]]  # sempre manter extremidade
        accumulated = 0
        for i in range(1, len(chain) - 1):
            accumulated += distance(chain[i-1], chain[i])
            if accumulated >= dist_max * 0.8:
                kept.append(chain[i])
                accumulated = 0
            elif accumulated < dist_min:
                G.nodes[chain[i]]['tipo'] = 'VERMELHO'  # marcar para remoção
        kept.append(chain[-1])
        for node in chain:
            if node not in kept:
                merge_edges_around(G, node)
                G.remove_node(node)
```

**Complexidade:** O(|V| + |E|) — varredura linear de todas as cadeias.

### Etapa 4 — Resolução de clusters de curva

Um cluster de curva é uma sequência de nós consecutivos onde o ângulo interno entre arestas adjacentes é **< 150°** (deflexão > 30°). O algoritmo substitui o cluster inteiro por **um único nó** na interseção das arestas retas de entrada e saída.

**Cálculo do ângulo (atan2, preferível a arccos por estabilidade numérica):**

```python
def angle_at_node(A, B, C):
    """Ângulo interno em B entre segmentos BA e BC, em graus."""
    u = np.array([A[0] - B[0], A[1] - B[1]])  # vetor BA
    v = np.array([C[0] - B[0], C[1] - B[1]])  # vetor BC
    cos_angle = np.dot(u, v) / (np.linalg.norm(u) * np.linalg.norm(v) + 1e-10)
    return np.degrees(np.arccos(np.clip(cos_angle, -1, 1)))
```

**Interseção das retas estendidas (forma paramétrica):**

Dadas as retas `L1: P = A + t(B - A)` e `L2: Q = C + s(D - C)`, a interseção é:

```
denom = (B_x - A_x)(D_y - C_y) - (B_y - A_y)(D_x - C_x)
t = ((C_x - A_x)(D_y - C_y) - (C_y - A_y)(D_x - C_x)) / denom
ponto = A + t × (B - A)
```

Se `|denom| < ε`, as retas são paralelas — usar centroide do cluster. A elevação do novo nó é interpolada da média dos nós de entrada e saída.

**Complexidade:** O(|V|) total para todos os clusters.

### Etapa 5 — Análise de elevação (nós amarelos e azul escuro)

```python
def detect_extrema(G, epsilon=0.5):
    maxima, minima = [], []
    for v in G.nodes():
        z_v = G.nodes[v]['z']
        neighbors = list(G.neighbors(v))
        if not neighbors:
            continue
        all_lower = all(G.nodes[n]['z'] < z_v - epsilon for n in neighbors)
        all_higher = all(G.nodes[n]['z'] > z_v + epsilon for n in neighbors)
        if all_lower:
            G.nodes[v]['tipo'] = 'AMARELO'  # ponto alto
            maxima.append(v)
        elif all_higher:
            G.nodes[v]['tipo'] = 'AZUL_ESCURO'  # ponto baixo
            minima.append(v)
    return maxima, minima
```

**Filtragem por proeminência:** Extremos com diferença de elevação < `min_prominence` (ex: 2m) em relação ao extremo oposto mais próximo são ignorados. Isso evita falsos positivos de ruído do DEM. A proeminência é calculada via BFS a partir do extremo até encontrar um ponto de elevação igual ou oposta.

Pontos altos (AMARELO) são candidatos a **início de rede** — esgoto flui naturalmente para baixo a partir deles. Pontos baixos (AZUL_ESCURO) são **problemáticos** — esgoto acumula e exige solução especial.

### Etapa 6 — Roteamento gravitacional da rede

Esta é a etapa central do algoritmo. A rede de esgoto é fundamentalmente uma **arborescência direcionada** (árvore enraizada no exutório/ETE) onde cada nó tem exatamente **uma aresta de saída** e o fluxo converge para a raiz.

**Algoritmo recomendado: Repeated Shortest Path Heuristic (RSPH)** para aproximar a **árvore de Steiner direcionada** (Steiner arborescence) de custo mínimo. Este é o mesmo algoritmo usado pelo pysewer (UFZ, 2024) e comprovado na literatura.

O RSPH funciona iterativamente:

```python
def rsph_sewer_routing(G, outlet, mandatory_nodes):
    """Repeated Shortest Path Heuristic para layout de esgoto."""
    # 1. Criar grafo direcionado: arestas apontam para BAIXO (gravidade)
    G_dir = nx.DiGraph()
    for u, v, data in G.edges(data=True):
        z_u, z_v = G.nodes[u]['z'], G.nodes[v]['z']
        if z_u > z_v:
            G_dir.add_edge(u, v, weight=edge_cost(u, v, data, G))
        elif z_v > z_u:
            G_dir.add_edge(v, u, weight=edge_cost(v, u, data, G))
        else:  # terreno plano — ambas direções com custo de escavação
            G_dir.add_edge(u, v, weight=edge_cost(u, v, data, G) * 1.5)
            G_dir.add_edge(v, u, weight=edge_cost(v, u, data, G) * 1.5)
    
    # 2. Iterativamente conectar cada nó obrigatório ao exutório
    T = nx.DiGraph()  # árvore resultado
    connected = {outlet}
    remaining = set(mandatory_nodes) - {outlet}
    
    while remaining:
        best_path, best_cost = None, float('inf')
        best_node = None
        for node in remaining:
            try:
                path = nx.dijkstra_path(G_dir, node, outlet, weight='weight')
                cost = nx.dijkstra_path_length(G_dir, node, outlet, weight='weight')
                # Desconto para caminhos que reutilizam arestas já na árvore
                shared = sum(1 for u, v in zip(path, path[1:]) if T.has_edge(u, v))
                adjusted_cost = cost - shared * REUSE_BONUS
                if adjusted_cost < best_cost:
                    best_path, best_cost, best_node = path, adjusted_cost, node
            except nx.NetworkXNoPath:
                continue
        
        if best_path is None:
            break  # nós isolados — necessitam estação elevatória
        
        # Adicionar caminho à árvore
        for u, v in zip(best_path, best_path[1:]):
            if not T.has_edge(u, v):
                T.add_edge(u, v, **G_dir[u][v])
        connected.update(best_path)
        remaining -= connected
    
    unreachable = remaining  # nós que não podem fluir por gravidade
    return T, unreachable
```

**Função de custo das arestas (combinando múltiplos fatores):**

```python
def edge_cost(u, v, data, G):
    L = data['length']
    z_u, z_v = G.nodes[u]['z'], G.nodes[v]['z']
    slope = (z_u - z_v) / L if L > 0 else 0
    
    # Custo de tubulação (proporcional ao comprimento)
    c_pipe = PIPE_UNIT_COST * L
    
    # Custo de escavação (não-linear com profundidade)
    avg_depth = max(MIN_COVER, (z_u + z_v) / 2 - MIN_COVER)
    c_excavation = (A_COEF * avg_depth**2 + B_COEF * avg_depth) * L
    
    # Penalidade se declividade insuficiente
    if slope < S_MIN:
        c_slope_penalty = SLOPE_PENALTY * L
    elif slope > S_MAX:
        c_slope_penalty = SLOPE_PENALTY * L * 0.5
    else:
        c_slope_penalty = 0
    
    # Penalidade se contra gravidade (precisa bombeamento)
    if slope < 0:
        c_pumping = PUMP_PENALTY  # custo alto
    else:
        c_pumping = 0
    
    return c_pipe + c_excavation + c_slope_penalty + c_pumping
```

**Alternativa — Arborescência de custo mínimo (Edmonds/Chu-Liu):** Encontra diretamente a árvore de custo mínimo enraizada no exutório em tempo **O(|V| log |V| + |E|)**. NetworkX implementa em `nx.minimum_spanning_arborescence()`. Vantagem: garante otimalidade. Desvantagem: exige que todos os nós sejam alcançáveis por gravidade, caso contrário falha — diagnosticando automaticamente onde são necessárias estações elevatórias.

### Etapa 7 — Resolução de pontos baixos

Para cada nó AZUL_ESCURO ou nó não alcançável da Etapa 6, o algoritmo avalia três alternativas e escolhe a de menor custo:

**Opção A — Rota alternativa:** Buscar caminho no grafo original que contorne o ponto baixo, usando Dijkstra com exclusão das arestas problemáticas. Custo = tubulação + escavação da nova rota.

**Opção B — Escavação profunda:** Manter a rota original, aprofundando o tubo para manter declividade mínima. Custo cresce exponencialmente com profundidade: `C(d) = a × d² + b × d + c`. Viável até ~**4-5m** em áreas urbanas brasileiras.

**Opção C — Estação elevatória:** Instalar bomba subterrânea. CAPEX: **R$ 150.000-500.000** para estações pequenas (Q ≤ 7,5 L/s). OPEX anual: energia + manutenção. A decisão usa **Valor Presente Líquido (VPL)** com horizonte de 20 anos:

```
VPL_elevatória = CAPEX + Σ(OPEX_anual / (1 + r)^t)  para t = 1..20
```

Onde `r` = taxa de desconto (tipicamente **8-12%** para infraestrutura no Brasil). Se `VPL_elevatória < Custo_escavação_profunda`, usar elevatória.

**Regra prática:** Quando a profundidade gravitacional excede **4,0-5,0m** consistentemente por trechos significativos, a elevatória torna-se mais econômica.

### Etapa 8 — Dimensionamento hidráulico e cálculo de custo

Com o layout definido, cada trecho é dimensionado hidraulicamente usando Manning e a equação da continuidade (detalhes na seção 2).

---

## 2. Matemática e fórmulas hidráulicas completas

### Fórmula de Manning

A equação fundamental para dimensionamento de tubulações de esgoto por gravidade:

**V = (1/n) × R_h^(2/3) × I^(1/2)**

Onde **V** = velocidade (m/s), **n** = coeficiente de rugosidade de Manning, **R_h** = raio hidráulico (m) = A_molhada / P_molhado, **I** = declividade (m/m). Combinada com a continuidade: **Q = A × V = (1/n) × A × R_h^(2/3) × I^(1/2)**.

A NBR 9649 determina **n = 0,013** para todos os materiais (PVC, concreto, PEAD), pois o biofilme (limo) que se forma nas paredes equaliza a rugosidade ao longo do tempo. A NBR 14486 permite **n = 0,010** para tubos PVC com tensão trativa mínima reduzida de **0,6 Pa**.

**Raio hidráulico para seção circular parcialmente cheia** (diâmetro D, lâmina y):

```
θ = 2 × arccos(1 - 2y/D)          [ângulo central, radianos]
P = (D/2) × θ                      [perímetro molhado]
A = (D²/8) × (θ - sin θ)           [área molhada]
R_h = A/P = (D/4) × (1 - sin θ/θ)  [raio hidráulico]
```

O máximo R_h/D ≈ **0,304** ocorre em y/D ≈ 0,81 (não a seção plena). Para seção plena: R_h = D/4.

### Tensão trativa (critério autolimpante)

**τ = γ × R_h × I**

Onde **τ** = tensão trativa (Pa), **γ** = peso específico (≈ 9.810 N/m³), **R_h** = raio hidráulico na vazão inicial, **I** = declividade. O valor mínimo conforme NBR 9649 é **τ_min = 1,0 Pa** (com n = 0,013), garantindo autolimpeza do coletor. Para NBR 14486 (PVC): **τ_min = 0,6 Pa** (com n = 0,010).

### Declividade mínima (NBR 9649 §5.1.4)

**I_min = 0,0055 × Qi^(-0,47)**

Onde **I_min** em m/m e **Qi** = vazão inicial de jusante em L/s. Esta fórmula satisfaz a condição de tensão trativa mínima de 1,0 Pa com n = 0,013.

| Qi (L/s) | I_min (m/m) | I_min (%) |
|----------|-------------|-----------|
| 1,5 | 0,0045 | 0,45% |
| 3,0 | 0,0032 | 0,32% |
| 5,0 | 0,0026 | 0,26% |
| 10,0 | 0,0019 | 0,19% |
| 20,0 | 0,0014 | 0,14% |

### Estimativa de vazão de esgoto

A vazão de esgoto sanitário é calculada a partir do consumo de água:

```
Q_d = (P × q × C) / 86400    [L/s]
Q_f,max = K1 × K2 × Q_d + Q_inf + Q_c
Q_i,max = K2 × Q_d,i + Q_inf,i + Q_c,i
```

Parâmetros típicos brasileiros: contribuição per capita **q = 150-200 L/hab/dia**, coeficiente de retorno **C = 0,80**, K1 = **1,2** (máx. diário), K2 = **1,5** (máx. horário), taxa de infiltração **0,05-1,0 L/s por km** de rede. A vazão mínima de dimensionamento é **Q_min = 1,5 L/s** em qualquer trecho (NBR 9649 §5.1.2).

### Fórmulas geoespaciais

**Haversine (distância entre coordenadas geográficas):**

```python
def haversine(lat1, lon1, lat2, lon2):
    R = 6_371_000  # metros
    φ1, φ2 = map(math.radians, [lat1, lat2])
    Δφ = math.radians(lat2 - lat1)
    Δλ = math.radians(lon2 - lon1)
    a = math.sin(Δφ/2)**2 + math.cos(φ1)*math.cos(φ2)*math.sin(Δλ/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
```

Para redes urbanas (< 50 km), Haversine tem erro < 0,3% — perfeitamente adequado. Na prática, **converta para UTM** (SIRGAS 2000 / UTM zona 23S = EPSG:31983 para São Paulo, por exemplo) e use distância euclidiana:

```python
from pyproj import Transformer
transformer = Transformer.from_crs("EPSG:4326", "EPSG:31983", always_xy=True)
x, y = transformer.transform(lon, lat)
dist = math.sqrt((x2-x1)**2 + (y2-y1)**2)
```

**Declividade entre dois pontos:**

```
S = (z_upstream - z_downstream) / distância_horizontal_2D
```

Sempre usar distância **2D horizontal** (não 3D), pois a fórmula de Manning define declividade como Δz / L_horizontal. Notar que DEM fornece elevação do **terreno**; a elevação do tubo é: `z_tubo = z_terreno - recobrimento - diâmetro`.

---

## 3. Parâmetros normativos consolidados (NBR 9649, 12207, 14486)

| Parâmetro | NBR 9649 | NBR 14486 (PVC) | NBR 12207 (interceptores) |
|-----------|----------|-----------------|--------------------------|
| **Diâmetro mínimo** | DN 150 (coletor), DN 100 (ramal) | DN 100 (ramal), DN 150 (coletor) | Conforme dimensionamento |
| **Vazão mínima** | 1,5 L/s | 1,5 L/s | — |
| **Manning n** | 0,013 | 0,010 | 0,013 |
| **Tensão trativa mín.** | 1,0 Pa | 0,6 Pa | 1,0 Pa (1,5 Pa c/ tempo seco) |
| **Lâmina máxima y/D** | ≤ 0,75 | ≤ 0,75 | ≤ 0,75 |
| **Velocidade máxima** | 5,0 m/s | 5,0 m/s | 5,0 m/s |
| **Velocidade crítica** | V_c = 6×√(g×R_h) | idem | idem |
| **Recobrimento mín. (rua)** | 0,90 m | 0,90 m | 0,90 m |
| **Recobrimento mín. (passeio)** | 0,65 m | 0,65 m | 0,65 m |
| **Dist. máx. entre PVs** | 80-120 m (por equipamento) | idem | idem |
| **PV — diâmetro mín. tampa** | 0,60 m | idem | idem |
| **PV — dimensão mín. câmara** | 0,80 m (planta) | idem | idem |

**Acessórios conforme NBR 9649 §5.2.6:**
- **PV (Poço de Visita):** obrigatório em reunião de > 2 coletores, quedas > 0,50m, mudanças de direção > 45°
- **TIL (Terminal de Inspeção e Limpeza):** substitui PV na junção de ≤ 2 coletores, quedas < 0,50m, profundidade ≤ 3,0m
- **TL (Terminal de Limpeza):** substitui PV no início de coletores
- **CP (Caixa de Passagem):** substitui PV em mudanças de direção, declividade, material e diâmetro quando quedas podem ser suprimidas

---

## 4. Tecnologias e bibliotecas Python recomendadas

### Grafo e roteamento

**NetworkX** é a biblioteca central para todas as operações de grafo. Para redes de escala urbana (até ~200.000 nós), funciona confortavelmente em memória. Funções essenciais:

```python
import networkx as nx

# Caminho mínimo com peso customizado
path = nx.dijkstra_path(G, source, target, weight=sewer_weight_func)

# Árvore geradora mínima
mst = nx.minimum_spanning_tree(G, weight='cost')

# Árvore de Steiner aproximada (conectar subconjunto de nós terminais)
from networkx.algorithms.approximation import steiner_tree
st = steiner_tree(G, terminal_nodes, weight='cost')

# Arborescência de custo mínimo (Edmonds/Chu-Liu)
arb = nx.minimum_spanning_arborescence(G_directed, attr='weight')

# Detecção de componentes conexos (verificar conectividade)
components = list(nx.connected_components(G))
```

**OSMnx** integra busca de redes viárias com elevação:

```python
import osmnx as ox
G = ox.graph.graph_from_bbox(bbox=(north, south, east, west))
G = ox.elevation.add_node_elevations_raster(G, filepath='fabdem.tif')
G = ox.elevation.add_edge_grades(G, add_absolute=True)
gdf_nodes, gdf_edges = ox.convert.graph_to_gdfs(G)
```

### DEM e topografia

**FABDEM** (Forest And Buildings removed Copernicus DEM) é a **melhor escolha** para planejamento urbano de esgoto no Brasil. Diferente do COP30 bruto (que é DSM e inclui edificações), o FABDEM remove artefatos de edificações e vegetação via machine learning, reduzindo o erro médio absoluto em áreas urbanas de **1,61m → 1,12m**. Disponível gratuitamente em resolução de 1 arco-segundo (~30m), cobrindo o Brasil inteiro.

| DEM | Tipo | Erro urbano (MAE) | Observação |
|-----|------|-------------------|------------|
| **FABDEM** | DTM corrigido | ~1,12m | **Recomendado** — sem edificações |
| COP30 | DSM | ~1,61m | Edificações distorcem |
| AW3D30 | DSM | ~2,5m | Robusto multi-região |
| SRTM v3 | DSM | ~3,8m | Legacy, sem cobertura > 60°N |
| NASADEM | DSM | Moderado | Reprocessamento do SRTM |

**Resolução de 30m é marginal** para projeto detalhado de esgoto (ruas podem ser mais estreitas), mas adequada para roteamento preliminar e análise de declividade. Para projeto executivo, complementar com levantamento topográfico local ou LiDAR municipal (IBGE).

**Workflow de análise hidrológica com WhiteboxTools:**

```python
import whitebox
wbt = whitebox.WhiteboxTools()
wbt.breach_depressions_least_cost("dem.tif", "dem_breached.tif", dist=5)
wbt.feature_preserving_smoothing("dem_breached.tif", "dem_smooth.tif", filter=9)
wbt.d8_pointer("dem_smooth.tif", "d8_pointer.tif")
wbt.d8_flow_accumulation("d8_pointer.tif", "flow_accum.tif", pntr=True)
wbt.basins(d8_pntr="d8_pointer.tif", output="basins.tif")
```

As bacias hidrográficas delineadas pelo DEM definem os **limites naturais de contribuição de cada trecho de esgoto** (sewersheds) e os caminhos de acumulação de fluxo indicam **corredores preferenciais de roteamento** — vales naturais onde a gravidade favorece o escoamento.

**rasterio para amostragem de elevação:**

```python
import rasterio
with rasterio.open('fabdem.tif') as src:
    coords = [(lon, lat) for lon, lat in street_vertices]
    elevations = [val[0] for val in src.sample(coords)]
```

Para interpolação bilinear (mais precisa que nearest-neighbor):

```python
from rasterstats import point_query
elevations = point_query(points_gdf, 'fabdem.tif', interpolate='bilinear')
```

### Geometria e operações espaciais

**Shapely** para operações em linhas e pontos:

```python
from shapely.geometry import LineString, Point
line = LineString([(0,0), (100,50), (200,0)])
ponto_50m = line.interpolate(50.0)          # ponto a 50m do início
distancia = line.project(Point(80, 30))      # projeção do ponto na linha
segmentos = split(line, Point(100, 50))      # dividir na interseção
```

**GeoPandas** para DataFrames espaciais, integração com PostGIS via `to_postgis()` e `read_postgis()`.

---

## 5. Decisões de arquitetura para o URBANUS

### Banco de dados: PostGIS substitui MongoDB para dados geoespaciais

**PostGIS (PostgreSQL) é significativamente superior ao MongoDB** para o caso do URBANUS. A comparação é inequívoca:

PostGIS oferece **1.000+ funções ST_*** (ST_Within, ST_Intersects, ST_Buffer, ST_DWithin, etc.) contra apenas **3-4 operadores** geoespaciais do MongoDB ($geoWithin, $geoIntersects, $near). Mais crítico: PostGIS possui extensão de **topologia** nativa e integração com **pgRouting** (Dijkstra, A*, análise de rede) — operações essenciais para roteamento de esgoto. Um benchmark mostrou PostGIS completando consultas de roteamento em **6,5s** contra **58,9s** do MongoDB para 10.000 pontos.

**Estratégia recomendada:**
- **PostGIS + pgRouting** como banco primário para grafos, geometrias e topologia
- **MongoDB** mantido apenas para cache de respostas da API, sessões, metadados não-estruturados
- **Migração:** usar GeoPandas como intermediário (MongoDB → GeoDataFrame → PostGIS via `to_postgis()`). ORM: SQLAlchemy + GeoAlchemy2 com FastAPI. Esforço estimado: **2-3 semanas**

**Neo4j não é necessário.** Redes de esgoto são essencialmente DAGs ou árvores — grafos estruturalmente simples que PostGIS+pgRouting resolve eficientemente. Neo4j excele em grafos altamente interconectados (redes sociais, fraud detection), não em árvores de infraestrutura.

### Processamento assíncrono: ARQ + Redis

O processamento de DEM e análise de grafos **deve ser assíncrono** — operações de 10-60 segundos que não podem bloquear a API.

**ARQ + Redis** é recomendado sobre Celery por ser nativo asyncio (alinha com FastAPI), mais leve e simples para MVP. Celery é síncrono por natureza e exige wrappers para integrar com FastAPI async.

```python
# Definição de task ARQ
async def process_sewer_network(ctx, project_id: str):
    graph = await load_graph_from_postgis(project_id)
    graph = sanitize_long_edges(graph, dist_max=100)
    graph = remove_redundant_nodes(graph, dist_min=20)
    graph = resolve_curve_clusters(graph, angle_threshold=150)
    maxima, minima = detect_extrema(graph)
    tree, unreachable = rsph_sewer_routing(graph, outlet)
    tree = resolve_low_points(tree, unreachable, graph)
    cost = calculate_total_cost(tree)
    await save_results_to_postgis(project_id, tree, cost)
```

### Arquitetura monolítica modular para MVP

Manter **monolito modular** em Docker Compose. Microserviços adicionariam complexidade operacional (service discovery, comunicação inter-serviço, tracing distribuído) sem benefício proporcional para equipe pequena.

```
urbanus/
├── api/              # FastAPI rotas
├── core/
│   ├── graph/        # NetworkX — sanitização, classificação
│   ├── elevation/    # rasterio — DEM, amostragem
│   ├── routing/      # RSPH, Edmonds — roteamento gravitacional
│   ├── hydraulics/   # Manning, dimensionamento
│   └── optimizer/    # Custo, resolução de pontos baixos
├── data/             # PostGIS + MongoDB access layer
├── workers/          # ARQ tasks
└── services/         # OSM, OpenTopography integrations
```

### Caching

Dados OSM → **filesystem** (GeoJSON/GeoPackage) com chave = hash do bounding box, TTL 7-30 dias. Para produção, rodar instância local do Overpass API com extrato regional OSM. Tiles DEM → **filesystem** organizado por coordenadas `cache/dem/{source}/{z}/{x}/{y}.tif`. Redis **não é adequado** para binários de DEM (10-500 MB); usar Redis apenas para resultados computados, fila de tarefas e cache de API.

### Processamento distribuído é desnecessário

NetworkX resolve confortavelmente grafos de até **~1 milhão de nós**. Uma rede de esgoto de cidade média (~250.000 hab.) tem **5.000-50.000 nós**. Mesmo para metrópoles, a rede raramente excede 200.000 nós. Apache Spark/GraphX seria engenharia excessiva — necessário apenas acima de **10M+ nós** (escala de redes sociais).

---

## 6. Topografia integrada ao algoritmo

### D8 Flow Direction aplicado ao contexto de esgoto

O algoritmo D8 atribui direção de fluxo à célula vizinha de maior declividade descendente entre 8 vizinhos. No contexto de esgoto, os caminhos de acumulação de fluxo natural (flow accumulation) do DEM indicam **corredores onde a gravidade naturalmente direciona fluidos** — estes são candidatos preferenciais para coletores-tronco.

**Workflow para informar roteamento de esgoto:**

1. **Pré-processar DEM:** Remover depressões com `breach_depressions_least_cost` (preferível a fill, pois preserva mais a topografia)
2. **Suavizar ruído urbano:** `feature_preserving_smoothing` com filtro 9×9
3. **Calcular flow direction + accumulation:** Células com alta acumulação = vales naturais = rotas ótimas para coletores-tronco
4. **Delinear bacias:** Cada bacia define uma sub-rede de esgoto independente com seu próprio exutório
5. **Sobrepor com grafo de ruas:** Associar cada aresta do grafo com seu valor de flow accumulation como peso adicional no roteamento (alto acumulação = menor custo = rota preferida)

```python
from pysheds.grid import Grid
grid = Grid.from_raster('fabdem_breached.tif')
dem = grid.read_raster('fabdem_breached.tif')
inflated = grid.resolve_flats(grid.fill_depressions(grid.fill_pits(dem)))
fdir = grid.flowdir(inflated)
acc = grid.accumulation(fdir)
# Usar acc como overlay no grafo para priorizar rotas em vales
```

### Limitações do DEM em áreas urbanas e mitigações

O COP30 é um DSM (Digital Surface Model) — edificações aparecem como elevações falsas de **1,6-5m acima** do terreno real. Para esgoto, isto pode criar falsos pontos altos ou obscurecer vales reais entre edificações. **FABDEM** resolve a maioria destes artefatos via remoção de edificações por machine learning.

Técnicas adicionais de mitigação do ruído:
- **Feature-preserving smoothing** (WhiteboxTools): suaviza ruído mantendo feições topográficas reais
- **Gaussian filter** (scipy): `gaussian_filter(dem, sigma=1.5)` para suavização simples
- **Validação cruzada:** comparar elevações do DEM com vértices OSM que possuem tag `ele=*`
- **Para projeto executivo:** sempre complementar com levantamento topográfico local

### Interpolação de elevação nos vértices de rua

Usar **interpolação bilinear** (não nearest-neighbor) para atribuir elevação do DEM a vértices do grafo. Com grid de 30m, a interpolação bilinear reduz o erro de quantização e produz transições mais suaves:

```python
from scipy.interpolate import RegularGridInterpolator
import rasterio

with rasterio.open('fabdem.tif') as src:
    dem = src.read(1).astype(float)
    rows = np.arange(dem.shape[0])
    cols = np.arange(dem.shape[1])
    interp = RegularGridInterpolator((rows, cols), dem, method='linear')
    
    for node in G.nodes():
        lon, lat = G.nodes[node]['x'], G.nodes[node]['y']
        col_frac, row_frac = ~src.transform * (lon, lat)
        G.nodes[node]['z'] = float(interp((row_frac, col_frac)))
```

---

## 7. Sistemas de referência, papers e projetos open-source

### O pysewer merece atenção especial

O projeto **pysewer** (UFZ Alemanha, publicado JOSS 2024, GitHub: dbdespot/pysewer) é o sistema open-source mais próximo do URBANUS. Usa NetworkX internamente, aplica **RSPH para aproximar árvore de Steiner direcionada**, prioriza fluxo gravitacional e identifica onde estações elevatórias são necessárias. Atributos de nó incluem `node_type`, `elevation`, `pumping_station`; atributos de aresta incluem `geometry`, `length`, `diameter`, `pressurized`, `needs_pump`. Estudar o código-fonte do pysewer deve ser a **primeira ação** da equipe antes de implementar o algoritmo.

**Outros projetos relevantes:** sewergraph (aerispaha/sewergraph, análise de redes existentes via NetworkX), QEsg (plugin QGIS brasileiro para projeto de esgoto), saniHUB RedBasica (plugin QGIS apoiado pelo BID para dimensionamento de redes condominiais), TEKSI/QGEP (modelo de dados PostGIS para redes de esgoto, referência excelente para esquema do banco).

### Validação com SWMM

Após gerar a rede com URBANUS, exportar para formato **SWMM .inp** (via biblioteca swmm_api) e rodar simulação hidráulica completa. SWMM (EPA, open-source, C) resolve as equações de Saint-Venant e verifica todas as restrições hidráulicas. A biblioteca Python **swmm_api** permite manipular modelos SWMM, executar simulações em batch e extrair resultados diretamente. PySWMM oferece interação em tempo de execução com o motor computacional do SWMM.

### Literatura acadêmica fundamental

A pesquisa acadêmica confirma que o problema de projeto de esgoto se decompõe em dois subproblemas: **otimização de layout** (quais ruas recebem tubos — Steiner tree / MST) e **dimensionamento hidráulico** (diâmetros, declividades, cotas de fundo — programação dinâmica ou caminho mínimo). Os trabalhos mais relevantes são:

- **Duque et al. (2016, 2020):** Modelam o dimensionamento como caminho mínimo em grafo de estados (nó = combinação manhole × diâmetro × cota), resolvido otimalmente por Bellman-Ford — **economia comprovada de 38%** vs. projeto manual
- **Hsieh et al. (2019):** Formulação MILP com árvore de Steiner para layout ótimo, economia de **38,83%**
- **Haghighi & Bakhshipour (2012-2015):** GA adaptativo e "Hanging Gardens Algorithm" para otimização simultânea de layout + dimensionamento
- **Moeini & Afshar (2012-2013):** ACO + Tree Growing Algorithm para layout + dimensionamento
- **Saldarriaga et al. (2021, 2024):** Layout baseado em topologia/topografia com inclusão de estações elevatórias via caminho mínimo — **estudo aplicado em Bogotá**, diretamente transferível para cidades brasileiras

### Visualização no frontend

Para o MVP, **Leaflet é adequado** para redes de até ~5.000 elementos. Porém, para escala de cidade, recomenda-se migrar para **MapLibre GL JS** (WebGL, gratuito, open-source) com **deck.gl** como overlay para camadas pesadas (PathLayer para tubos com largura proporcional ao diâmetro, ScatterplotLayer para PVs com cor por tipo, IconLayer para setas de direção de fluxo). Para perfis longitudinais de esgoto (vista engenharia padrão: terreno + fundo do tubo ao longo do trecho), usar **Plotly.js** ou **Recharts** em painel lateral interativo.

---

## Conclusão: roteiro de implementação priorizado

A arquitetura algorítmica do URBANUS está solidamente fundamentada em literatura acadêmica recente e projetos open-source comprovados. Três ações imediatas maximizam o progresso: **(1)** estudar o código-fonte do pysewer e adaptar o RSPH para o contexto brasileiro com parâmetros da NBR 9649; **(2)** migrar dados geoespaciais para PostGIS, onde pgRouting já fornece Dijkstra e análise de rede prontos para uso; **(3)** implementar o pipeline de 8 etapas incrementalmente, validando cada etapa com exportação para SWMM.

A insight central deste documento é que **o roteamento de esgoto gravitacional é matematicamente equivalente ao problema da arborescência de custo mínimo** — um problema bem resolvido em tempo polinomial pelo algoritmo de Edmonds. A função de custo das arestas combina escavação (não-linear com profundidade), tubulação (função do diâmetro) e penalidade de bombeamento, transformando restrições de engenharia em pesos de grafo. Pontos baixos que impedem o fluxo gravitacional diagnosticam-se automaticamente como nós inatingíveis na arborescência, indicando precisamente onde estações elevatórias são necessárias — sem heurísticas ad hoc.

O uso de FABDEM em vez de COP30 bruto, interpolação bilinear para elevação, e flow accumulation como heurística de priorização de rotas são decisões técnicas que distinguem um MVP funcional de um sistema verdadeiramente útil para engenheiros sanitaristas brasileiros.