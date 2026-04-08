# 14 -- Algoritmo e Fluxo Real do Pipeline

## Objetivo

Este documento explica o fluxo real executado hoje no URBANUS, ponta a ponta:

1. enriquecimento de elevacao das ruas
2. extracao e consolidacao de nos
3. montagem do grafo editavel no frontend
4. processamento do grafo editado no FastAPI
5. consumo do `SewerNetwork` processado pelo frontend

O objetivo aqui nao e repetir o pipeline historico de "8 etapas", e sim descrever o comportamento efetivo do codigo atual.

## Visao geral do fluxo

```text
streets GeoJSON
  -> POST /elevation/enrich
  -> GeoJSON com vertex_elevations
  -> POST /nodes/extract
  -> MapNode[]
  -> mapNodesToNetworkGraph
  -> NetworkGraph editavel
  -> ProjectEditor serializa nodes + edges
  -> POST /projects/{id}/process
  -> _build_graph_from_edited
  -> G (nx.Graph)
  -> saneamento + classificacao + roteamento + cobertura + otimizacao + hidraulica
  -> SewerNetwork
  -> persistencia no PostGIS + snapshot no projeto
  -> pipelineStore + renderizacao no mapa/paineis
```

## Representacoes usadas ao longo do fluxo

### 1. GeoJSON enriquecido

E a malha de ruas com elevacao amostrada por vertice.

Cada `LineString` recebe:

- `vertex_elevations`
- `elevation.min`
- `elevation.max`
- `elevation.avg`
- `elevation.range`

Essa etapa acontece em `apps/api/src/urbanus_api/services/elevation.py`.

### 2. `MapNode[]`

E o contrato retornado por `POST /nodes/extract`.

Cada item ainda carrega contexto de rua e de vertice:

- posicao
- elevacao
- `streetId`
- `streetName`
- `vertexIndex`
- `isEndpoint`
- `isIntersection`
- `nodeType`
- `pvObrigatorio`

### 3. `NetworkGraph`

E o modelo do editor no frontend.

- `nodes: Record<string, NetworkNode>`
- `edges: Record<string, NetworkEdge>`

Esse grafo e a fonte de verdade durante a edicao. Ele fica no `graphStore`.

### 4. `G: nx.Graph`

E o grafo nao-direcionado reconstruido no backend a partir do snapshot editado enviado pelo frontend.

Ele representa a malha editada antes da decisao de sentido de escoamento.

### 5. `tree: nx.DiGraph`

E a rede dirigida final no sentido do escoamento.

Ela comeca a nascer no RSPH e depois e ajustada por:

- resolucao de `unreachable`
- cobertura total
- quebra de ciclos
- reducao de nos

### 6. `SewerNetwork`

E o payload serializado final retornado ao frontend e salvo no banco:

- `nodes`
- `edges`
- `pipes`
- `pump_stations`
- `unreachable_nodes`
- `total_cost`

## Etapa A -- Enriquecimento de elevacao

Arquivo principal: `apps/api/src/urbanus_api/services/elevation.py`

Endpoint:

- `POST /elevation/enrich`

### O que entra

- `geojson`
- `bbox`
- `demType`

### O que acontece

1. valida a chave `OPENTOPOGRAPHY_API_KEY`
2. calcula a area da bbox e bloqueia acima de `MAX_AREA_KM2`
3. baixa um GeoTIFF do OpenTopography
4. abre o raster em memoria com `rasterio`
5. amostra cada vertice de cada `LineString`
6. transforma `nodata` em `None`
7. tenta detectar zeros espurios de borda da bbox
8. interpola lacunas com base nos vizinhos validos da mesma linha
9. grava estatisticas simples de elevacao por feature

### Detalhes importantes

- O saneamento de borda trata `0` como suspeito quando o contexto local indica terreno bem mais alto.
- A interpolacao e local, dentro da propria `LineString`; ela nao busca informacao em outras ruas.
- O pipeline posterior depende completamente das elevacoes presentes no grafo editado. O backend de processamento nao volta ao DEM nessa fase.

## Etapa B -- Extracao inicial de nos

Arquivo principal: `apps/api/src/urbanus_api/core/graph/classification.py`

Endpoint:

- `POST /nodes/extract`

### O que `extract_nodes` faz

O backend percorre o GeoJSON enriquecido em duas passagens.

#### Passagem 1: mapear posicoes para ruas conectadas

Ele cria um `position_map` por coordenada arredondada para calcular:

- quantas ruas passam ali
- quais `street_ids` existem naquele ponto
- quais `street_names` existem naquele ponto

Esse calculo e a base para definir o `degree` estrutural do no.

#### Passagem 2: gerar um no por vertice

Para cada vertice de cada rua:

- calcula `isIntersection` quando `degree >= 2`
- calcula `isEndpoint` no inicio/fim da geometria
- copia a elevacao daquele indice em `vertex_elevations`
- marca `ROSA` e `pvObrigatorio=True` para endpoints
- marca `ROSA` e `pvObrigatorio=True` quando detecta queda abrupta maior que `0.50 m` para um vizinho adjacente

### Clustering espacial

Depois da extracao bruta, `_cluster_nearby_nodes` une nos a menos de `SNAP_DISTANCE_METERS`:

- usa Union-Find
- escolhe como representante o no de maior grau
- une `connectedStreets`
- une `streetNames`
- faz media das elevacoes validas
- preserva `pvObrigatorio` se qualquer membro do cluster for obrigatorio

Esse passo elimina duplicidade espacial pequena antes do editor.

### Marcacao de maximo e minimo globais no conjunto extraido

Depois do clustering, `extract_nodes` ainda identifica:

- o no de maior elevacao entre intersecoes -> `isHighestElevation`
- o no de menor elevacao entre intersecoes -> `isLowestElevation`

Se esses nos ainda nao tiverem classificacao:

- maior elevacao recebe `AMARELO`
- menor elevacao recebe `AZUL_ESCURO`

### Observacao importante

Essa classificacao nao e a classificacao final do pipeline. O backend recalcula marcacoes mais tarde no grafo editado usando `detect_extrema`.

## Etapa C -- Transformacao para o grafo editavel do frontend

Arquivos principais:

- `apps/web/features/map/services/NodesApiService.ts`
- `apps/web/lib/graph/serialization.ts`
- `apps/web/lib/graph/types.ts`

### O que o frontend recebe

`NodesApiService` chama `/api/nodes/extract` e recebe `MapNode[]`.

### O que `mapNodesToNetworkGraph` faz

O editor nao trabalha com um no por vertice por rua. Ele colapsa isso para um grafo canônico.

#### 1. Deduplicacao de nos por posicao

Nos em coordenadas equivalentes sao colapsados usando `lat/lng` arredondados.

Na fusao:

- a elevacao relevante e preservada por `preferElevation`
- flags estruturais sao combinadas
- `connectedStreets` e unido
- o primeiro `nodeType` util tende a ser preservado

#### 2. Selecao de "anchor nodes"

Nem todo vertice vira no do editor. O frontend privilegia:

- intersecoes
- endpoints
- extremos geograficos da rua

Isso reduz o numero de nos no `NetworkGraph`.

#### 3. Criacao de arestas

Para cada rua:

- os nos sao ordenados pela geometria dominante da rua
- anchors consecutivos sao conectados
- o comprimento e calculado por distancia geografica
- a inclinacao inicial e estimada

O resultado e um `NetworkGraph` simplificado, editavel e mais leve que a extracao vertex-by-vertex original.

## Etapa D -- O que o editor envia para o backend

Arquivos principais:

- `apps/web/app/projects/[id]/ProjectEditor.tsx`
- `apps/web/stores/pipelineStore.ts`
- `apps/web/app/api/projects/[id]/process/route.ts`

### Como o payload e montado

Quando o usuario processa:

1. o editor pega o snapshot atual do `graphStore`
2. serializa `nodes` e `edges`
3. envia JSON para `/api/projects/{id}/process`
4. o proxy Next repassa o mesmo body para o FastAPI

Cada no enviado inclui:

- `id`
- `lng`
- `lat`
- `elevation`
- `node_type`
- `pv_obrigatorio`
- `is_intersection`
- `is_endpoint`
- `is_collection_point`

Cada aresta enviada inclui:

- `id`
- `sourceId`
- `targetId`
- `length`
- `streetName`
- `highway`

### Consequencia arquitetural importante

O contrato de verdade para o processamento e o snapshot do editor.

O endpoint `POST /projects/{id}/process` nao reconstrui mais o grafo a partir de `streets_geojson`.

## Etapa E -- Reconstrucao de `G` no backend

Arquivo principal: `apps/api/src/urbanus_api/main.py`

Funcao:

- `_build_graph_from_edited`

### O que essa funcao faz

Ela recebe `ProcessRequest` e monta um `nx.Graph`.

#### Nos

Cada no vira um no em `G` com atributos:

- `x`, `y`, `z`
- `node_type`
- `pv_obrigatorio`
- `is_intersection`
- `is_endpoint`
- `is_collection_point`

#### Arestas

Cada aresta vira uma edge com:

- `length_m`
- `name`
- `highway`
- `street_id`

### Validacoes que geram `400`

- body ausente
- `nodes` vazio
- `edges` vazio
- arestas apontando para nos inexistentes
- nenhum no com elevacao valida para escolher `outlet`

## Etapa F -- Saneamento inicial de elevacoes

Arquivo principal: `apps/api/src/urbanus_api/main.py`

Funcao:

- `_sanitize_spurious_zero_elevations`

### O que faz

Se um no tem `z = 0`, mas os vizinhos validos estao muito acima, o `0` e tratado como artefato e trocado por `None`.

### Por que existe

Mesmo com o saneamento no enriquecimento do DEM, alguns zeros espurios ainda conseguem atravessar o fluxo. Esse guard evita:

- escolha errada de `outlet`
- sentido de escoamento incorreto
- penalidade falsa de rota

## Etapa G -- Marcacoes estruturais antes do roteamento

Arquivos principais:

- `apps/api/src/urbanus_api/core/graph/classification.py`
- `apps/api/src/urbanus_api/core/graph/sanitization.py`
- `apps/api/src/urbanus_api/core/elevation/extrema.py`

### 1. `enforce_direction_changes`

Percorre nos de grau 2 que ainda nao sao obrigatorios.

Para cada um:

- calcula o angulo entre as duas arestas adjacentes
- transforma em deflexao: `180 - angulo`
- se a deflexao passar de `DIRECTION_CHANGE_THRESHOLD`, marca:
  - `node_type = "ROSA"`
  - `pv_obrigatorio = True`

Ideia: joelhos de tubulacao importantes precisam de PV.

### 2. `remove_redundant_nodes`

Remove nos nao obrigatorios com grau 2 quando:

- ambas as arestas incidentes sao curtas
- o comprimento combinado ainda nao ultrapassa `LONG_EDGE_MAX_DISTANCE`

Na pratica:

- o no e removido
- as duas arestas viram uma so

Objetivo: limpar granularidade excessiva da malha editada.

### 3. `resolve_curve_clusters`

Tenta substituir nos de curva acentuada por um no melhor posicionado na intersecao das tangentes.

Fluxo teorico:

- pega no de grau 2 nao obrigatorio
- mede o angulo interno
- se for menor que `CURVE_ANGLE_THRESHOLD`, calcula intersecao das tangentes
- remove o no original e insere um novo no

### Comportamento real importante

No codigo atual, essa etapa tende a nao alterar a geometria na pratica.

Motivo:

- a intersecao e calculada usando as retas `A->B` e `B->C`
- essa formulacao naturalmente intersecta no proprio ponto `B`
- existe um guard para evitar substituir o no por outro na mesma coordenada
- esse guard existe para impedir loop infinito no `while`

Resultado: a etapa existe no pipeline, mas costuma ser neutra no comportamento real.

### 4. `enforce_min_pv_spacing`

Faz merge de PVs obrigatorios muito proximos quando:

- o no candidato e `pv_obrigatorio`
- tem grau 2
- ha um vizinho tambem `pv_obrigatorio`
- a aresta entre eles e menor que `MIN_PV_SPACING`

Objetivo: evitar excesso de PV em pequenos intervalos.

### 5. `detect_extrema`

Reclassifica maximos e minimos locais usando o grafo atual, nao a extracao original.

Para cada no nao obrigatorio com elevacao:

- se todos os vizinhos sao mais baixos -> candidato a maximo
- se todos os vizinhos sao mais altos -> candidato a minimo

Depois calcula proeminencia via BFS limitada.

So marca:

- `AMARELO` para maximos relevantes
- `AZUL_ESCURO` para minimos relevantes

Isso reduz falso positivo de ruido de DEM.

### 6. `detect_grade_breaks`

Olha nos de grau 2 nao obrigatorios.

Para cada lado do no:

- calcula a inclinacao do terreno
- compara as duas inclinacoes

Se a diferenca passar de `GRADE_BREAK_THRESHOLD`, marca:

- `node_type = "ROSA"`

Ponto sutil:

- esta funcao nao seta `pv_obrigatorio = True`
- o comentario do codigo deixa claro que a otimizacao posterior deve respeitar essa quebra de greide

## Etapa H -- Escolha de `mandatory`, `outlet` e `collection_points`

Arquivo principal: `apps/api/src/urbanus_api/main.py`

### `mandatory`

Depois da sanitizacao, o backend recalcula o conjunto obrigatorio:

- `pv_obrigatorio = True`
- ou `node_type == "ROSA"`

### `outlet`

O `outlet` e simplesmente o no de menor elevacao valida em `G`.

Nao existe hoje uma heuristica hidraulica ou urbana mais sofisticada para escolher o destino final.

### `collection_points`

Existem dois modos.

#### Modo 1: selecao manual do usuario

Se houver nos com `is_collection_point=True` no payload editado:

- eles vencem
- o `outlet` e sempre incluido

#### Modo 2: selecao automatica

Se nao houver selecao manual:

- o backend escolhe candidatos com `node_type == "AZUL_ESCURO"`
- ordena do mais baixo para o mais alto
- deduplica espacialmente usando `MIN_PV_SPACING`
- preserva sempre o `outlet`

Depois todos os collection points escolhidos recebem:

- `is_collection_point = True`
- `pv_obrigatorio = True`

## Etapa I -- RSPH: espinha dorsal gravitacional

Arquivos principais:

- `apps/api/src/urbanus_api/core/routing/rsph.py`
- `apps/api/src/urbanus_api/core/routing/cost.py`

### Ideia geral

O RSPH monta a espinha dorsal da rede por gravidade.

Ele nao comeca tentando cobrir toda a malha. Primeiro ele conecta os nos obrigatorios ao sistema coletor mais conveniente.

### Como o grafo dirigido e criado

Cada aresta nao-direcionada de `G` vira uma ou duas arestas em `DG`:

- se `z_u >= z_v`, cria `u -> v`
- se `z_v >= z_u`, cria `v -> u`
- se faltar elevacao, cria ambas

Ou seja, o grafo dirigido respeita preferencialmente o fluxo alto -> baixo.

### Super-sink virtual

Como podem existir varios `collection_points`, o algoritmo cria um no artificial:

- `__super_sink__`

Cada ponto de coleta recebe uma aresta de custo zero ate esse super-sink.

Assim, cada no obrigatorio pode ser roteado para o melhor coletor, nao necessariamente para o `outlet` global diretamente.

### Ordem de processamento dos obrigatorios

Os nos obrigatorios sao ordenados da maior elevacao para a menor.

Intencao:

- resolver primeiro os caminhos mais altos e mais longos
- favorecer troncos compartilhados nas iteracoes seguintes

### Funcao de custo

`edge_cost` combina:

- custo de tubulacao por comprimento
- custo de escavacao com profundidade minima fixa
- penalidade por declividade insuficiente
- penalidade muito alta para contra-gravidade
- desconto para arestas ja reutilizadas

O desconto de reutilizacao (`REUSE_BONUS`) induz convergencia em troncos coletores.

### O que o RSPH devolve

- `tree: nx.DiGraph`
- `unreachable: list[str]`

`tree` aqui ainda nao e a rede final completa; e a espinha dorsal conectando os obrigatorios.

## Etapa J -- Resolucao de `unreachable`

Arquivo principal: `apps/api/src/urbanus_api/core/optimizer/low_points.py`

### O que essa etapa realmente faz

Apesar do nome sugerir tratamento geral de low points, o loop principal percorre:

- `unreachable`

Ou seja:

- ela nao percorre automaticamente todos os nos `AZUL_ESCURO`
- ela tenta resolver os nos que o RSPH nao conseguiu conectar gravitacionalmente

### Opcoes avaliadas por no

Para cada no inalcançavel:

#### Opcao A: rota alternativa

Executa Dijkstra no grafo original com a mesma funcao de custo.

Se encontrar caminho aceitavel, tenta adicionar esse caminho ao `tree`.

#### Opcao B: escavacao profunda

Calcula um custo simplificado usando profundidade maxima gravitacional.

No codigo atual, essa opcao so coloca:

- `extra_depth = MAX_GRAVITY_DEPTH`

no no adicionado, e conecta ao no mais proximo da arvore.

#### Opcao C: elevatoria

Calcula um NPV simplificado com:

- `capacity_ls = 7.5`
- `head_m = MAX_GRAVITY_DEPTH`
- `capex = PUMP_CAPEX_MIN`
- `annual_opex = 5% do CAPEX`

Se essa for a melhor opcao:

- cria um `PumpStation`
- adiciona uma aresta `is_pressurized=True`

### Detalhe importante

Essa etapa escolhe a alternativa mais barata entre rota, escavacao e bombeamento, mas de forma ainda simplificada.

## Etapa K -- Cobertura total da malha

Arquivo principal: `apps/api/src/urbanus_api/core/graph/coverage.py`

### Por que essa etapa existe

O RSPH constroi a espinha dorsal conectando obrigatorios, nao todas as ruas.

Mas o produto quer que toda aresta do grafo editado fique representada na rede final.

### O que `ensure_full_coverage` faz

Para cada aresta de `G` que ainda nao esta em `tree`:

1. garante que os dois nos existam em `tree`
2. decide um sentido
3. evita criar ciclos
4. adiciona a aresta

### Regra de direcao

- com elevacao nos dois lados: alto -> baixo
- com elevacao em um lado so: favorece o lado com elevacao como destino do fluxo
- sem elevacao em ambos: usa uma heuristica baseada em conexao previa com o core da arvore

### Consequencia

Depois dessa etapa, a rede final deixa de ser apenas uma espinha dorsal de obrigatorios e passa a cobrir toda a malha representada por `G`.

## Etapa L -- Quebra de ciclos

Arquivo principal: `apps/api/src/urbanus_api/main.py`

Funcao:

- `_break_cycles`

### Quando acontece

So executa se `tree` nao for um DAG depois da cobertura.

### Estrategia

Enquanto houver ciclo:

- encontra um ciclo
- escolhe a pior aresta do ciclo
- "pior" aqui significa a que sobe mais ou desce menos
- remove essa aresta

Depois o backend chama `ensure_full_coverage` de novo para recompor cobertura se a quebra removeu algo importante.

## Etapa M -- Otimizacao de posicionamento de nos

Arquivo principal: `apps/api/src/urbanus_api/core/optimizer/node_reduction.py`

Essa e uma etapa central do pipeline atual e vai alem do documento historico de "8 etapas".

### Objetivo

Reduzir a quantidade de nos/PVs sem destruir:

- espacamento maximo
- direcao de escoamento
- necessidade geometrica de mudanca de direcao
- necessidade de quebra de greide

### Ordem real da otimizacao

#### 1. Contração gulosa

Primeiro roda `_greedy_contract`, que inclui:

- simplificacao de juncoes
- remocao de nos pass-through

Um no pode ser removido se o conjunto `pred -> node -> succ`:

- nao ultrapassar `MAX_PV_SPACING`
- tiver deflexao abaixo de `DIRECTION_CHANGE_THRESHOLD`
- tiver quebra de greide abaixo de `GRADE_BREAK_THRESHOLD`

#### 2. Merge espacial

Depois roda `_merge_close_nodes`:

- agrupa nos proximos por Union-Find
- preserva `outlet`
- escolhe representante por grau
- redireciona arestas

Esse merge usa raio fixo de `20 m`.

#### 3. Quebra de ciclos se o merge espacial criou ciclos

Se o merge espacial introduzir ciclo:

- remove a aresta com menor queda de elevacao

#### 4. Refinamento MILP opcional

Por fim roda `_milp_refine`.

So executa se `scipy.optimize.milp` estiver disponivel.

Ele tenta resolver melhor cadeias de candidatos, respeitando o espacamento maximo entre PVs.

### Ponto importante

A ordem real e:

1. contração gulosa
2. merge espacial
3. quebra de ciclos
4. MILP opcional

Isso precisa ser explicitado porque comentarios antigos podem sugerir outra leitura.

## Etapa N -- Dimensionamento hidraulico

Arquivo principal: `apps/api/src/urbanus_api/core/hydraulics/dimensioning.py`

### Como a populacao contribuinte e estimada

O backend faz um `topological_sort` do `tree` e acumula contribuicao a montante.

Cada no parte de:

- `population_per_node = 50`

O acumulado de contribuicao do no de montante e usado para estimar a vazao da aresta que sai dele.

### Como a vazao de projeto e calculada

Para cada aresta gravitacional:

1. estima populacao contribuinte
2. calcula `q_d` por `sewage_flow_estimate`
3. calcula pico por `peak_flow`
4. aplica piso `MIN_FLOW_RATE`

### Como a declividade e escolhida

O backend calcula a inclinacao geometrica do trecho.

Depois compara com `min_slope(q_design)` e usa:

- `max(slope_geometrica, slope_minima_normativa)`

### Selecionando diametro

`_select_diameter` percorre os `PIPE_DIAMETERS` e busca o menor DN que atende:

- tensao trativa minima
- lamina maxima `y/D`
- velocidade maxima

Para isso ele:

- converte a vazao para `m3/s`
- faz busca binaria de enchimento parcial
- calcula raio hidraulico
- calcula velocidade por Manning
- calcula tensao trativa

### Invert elevation e profundidade

Quando ha elevacao nos dois extremos:

- calcula `invert_up`
- calcula `invert_down`
- grava profundidades e cotas nos nos do `tree`

Se a profundidade a jusante ficar acima de `MAX_GRAVITY_DEPTH`, a aresta recebe:

- `needs_pump_review = True`

### Trechos pressurizados

Se a aresta tiver `is_pressurized=True`:

- o codigo nao faz um dimensionamento pressurizado detalhado
- cria um `PipeSegment` simplificado com DN minimo coletor

### Ponto critico para leitura do resultado

O resultado hidraulico util fica em `pipes`.

Os campos `edges.slope` e `edges.cost` do `SewerNetwork` nao sao a fonte confiavel do dimensionamento final.

## Etapa O -- Acessorios e custo total

Arquivos principais:

- `apps/api/src/urbanus_api/core/graph/accessories.py`
- `apps/api/src/urbanus_api/core/hydraulics/costing.py`

### `assign_accessory_types`

Hoje a atribuicao e propositalmente simples:

- todo no da rede processada recebe `accessory_type = "PV"`

O papel de ponto de coleta continua separado em:

- `is_collection_point`

Entao:

- `PV` aqui significa o acessorio emitido para cada no fisico da rede
- `collection point` e uma funcao logica/topologica adicional

### `compute_total_cost`

O custo total soma:

- custo de tubo por diametro
- custo de escavacao por profundidade
- NPV das elevatorias

O comprimento de cada trecho vem do `tree`, via `edge_id`.

## Etapa P -- Persistencia

Arquivo principal: `apps/api/src/urbanus_api/data/repositories.py`

Funcao:

- `save_sewer_network_to_postgis`

### O que e salvo

Antes de inserir de novo, a funcao limpa as tabelas do projeto:

- `pump_stations`
- `pipe_segments`
- `edges`
- `nodes`

Depois repopula tudo com o `SewerNetwork` atual.

### Snapshot no projeto

Depois de salvar as tabelas processadas, `process_sewer_network` ainda atualiza:

- `project.streets_geojson["_sewerNetwork"]`

Esse snapshot e o que permite reidratar o editor depois.

## Etapa Q -- Como o frontend consome o resultado

Arquivos principais:

- `apps/web/stores/pipelineStore.ts`
- `apps/web/lib/graph/sewerConversion.ts`
- `apps/web/components/pipeline/PipelineResultsPanel.tsx`
- `apps/web/components/map/SewerNetworkLayers.tsx`

### `pipelineStore`

Controla:

- `status`
- `result`
- `error`
- `_cachedResult`
- `selectedNodeId`

### Alternancia entre grafo original e rede processada

Quando o processamento termina:

- o resultado volta como `SewerNetwork`
- o frontend o converte para `NetworkGraph` com `sewerNetworkToGraph`
- esse grafo processado substitui o grafo atual no editor

Ao alternar visualizacao:

- `result` some e vai para `_cachedResult` quando o usuario quer ver o pre-processamento
- `_cachedResult` volta para `result` quando o usuario quer rever a rede processada

### O que `sewerNetworkToGraph` reaproveita

Nos:

- `node_type`
- `elevation`
- `degree`
- `is_endpoint`
- `is_intersection`
- `is_collection_point`
- `pv_obrigatorio`
- `accessory_type`

Arestas:

- `source_node_id`
- `target_node_id`
- `length_m`
- `slope`
- `waypoints`

Tubos:

- sao usados para recuperar `diameter_mm`

### O que `PipelineResultsPanel` mostra

O painel usa o `SewerNetwork` para mostrar:

- numero de nos
- numero de segmentos
- comprimento total
- numero de elevatorias
- numero de inalcançaveis
- contagem por categoria visual de no

### O que `SewerNetworkLayers` usa

No mapa, a camada de rede usa:

- `network.nodes` para renderizar pontos
- `network.edges` para geometria e direcao
- `network.pipes` para largura/cor associada ao diametro

Detalhe importante:

- a renderizacao de tubos confia no `edge_id` do `PipeSegment`
- se nao achar correspondencia direta, ainda tenta `source->target`

## Thresholds e formulas que governam o algoritmo

As principais constantes ficam em:

- `py/urbanus-geo/src/urbanus_geo/constants.py`

As formulas ficam em:

- `py/urbanus-geo/src/urbanus_geo/calculations.py`

Valores centrais no pipeline atual:

- `SNAP_DISTANCE_METERS = 5 m`
- `REDUNDANT_NODE_MIN_DISTANCE = 20 m`
- `LONG_EDGE_MAX_DISTANCE = 100 m`
- `CURVE_ANGLE_THRESHOLD = 150 graus`
- `DIRECTION_CHANGE_THRESHOLD = 45 graus`
- `GRADE_BREAK_THRESHOLD = 0.03 m/m`
- `ELEVATION_PROMINENCE_MIN = 2 m`
- `MIN_PV_SPACING = 80 m`
- `MAX_PV_SPACING = 100 m`
- `MIN_FLOW_RATE = 1.5 L/s`
- `MAX_GRAVITY_DEPTH = 4.5 m`
- `REUSE_BONUS = 0.5`
- `PUMP_PENALTY = 100000`

Formulas relevantes:

- declividade: `slope_2d = (z_up - z_down) / distance`
- declividade minima: `I_min = 0.0055 * Qi^-0.47`
- Manning: `V = (1/n) * Rh^(2/3) * I^(1/2)`
- tensao trativa: `tau = gamma * Rh * I`
- vazao media: `Q_d = (P * q * C) / 86400`
- vazao de pico: `Q_f,max = K1 * K2 * Q_d + Q_inf + Q_c`
- NPV de elevatoria: `CAPEX + soma(OPEX descontado)`

## Divergencias importantes entre leitura superficial e comportamento real

### 1. O pipeline atual e maior que o "8 etapas"

A execucao real tambem inclui:

- cobertura total
- quebra de ciclos
- reducao de nos em varias fases

### 2. `resolve_low_points` nao percorre todos os low points automaticamente

Ele processa `unreachable`.

Os `AZUL_ESCURO` influenciam principalmente:

- selecao automatica de `collection_points`

### 3. `resolve_curve_clusters` tende a ser neutro hoje

Por causa da forma da intersecao e do guard de no-op, a etapa costuma nao mover o grafo na pratica.

### 4. A otimizacao de nos nao e apenas MILP

O grosso do efeito vem antes:

- contração gulosa
- merge espacial
- quebra de ciclos

O MILP e refinamento opcional.

### 5. Todo no final recebe `PV`

`accessory_type` nao diferencia hoje TL, TIL, CP etc.

### 6. A hidraulica confiavel esta em `pipes`

`edges` carregam dados topologicos e geometricos; o dimensionamento util vem dos `PipeSegment`.

## Leitura mental correta do algoritmo

Uma forma fiel de pensar o pipeline atual e:

1. preparar elevacoes por vertice
2. extrair e consolidar nos editaveis
3. deixar o usuario editar um grafo simplificado
4. reconstruir esse grafo no backend
5. decidir quais nos sao realmente estruturais
6. montar uma espinha dorsal gravitacional por menor custo
7. resolver o que ficou sem caminho
8. reinserir cobertura total da malha
9. simplificar a rede para reduzir PVs
10. dimensionar hidraulicamente os trechos
11. serializar, salvar e renderizar

## Arquivos-chave para navegar o codigo

Se voce quiser acompanhar essa explicacao direto na implementacao, leia nessa ordem:

1. `apps/api/src/urbanus_api/main.py`
2. `apps/api/src/urbanus_api/services/elevation.py`
3. `apps/api/src/urbanus_api/core/graph/classification.py`
4. `apps/api/src/urbanus_api/core/graph/sanitization.py`
5. `apps/api/src/urbanus_api/core/elevation/extrema.py`
6. `apps/api/src/urbanus_api/core/routing/rsph.py`
7. `apps/api/src/urbanus_api/core/routing/cost.py`
8. `apps/api/src/urbanus_api/core/optimizer/low_points.py`
9. `apps/api/src/urbanus_api/core/graph/coverage.py`
10. `apps/api/src/urbanus_api/core/optimizer/node_reduction.py`
11. `apps/api/src/urbanus_api/core/hydraulics/dimensioning.py`
12. `apps/api/src/urbanus_api/core/hydraulics/costing.py`
13. `apps/api/src/urbanus_api/core/graph/accessories.py`
14. `apps/web/app/projects/[id]/ProjectEditor.tsx`
15. `apps/web/stores/pipelineStore.ts`
16. `apps/web/lib/graph/serialization.ts`
17. `apps/web/lib/graph/sewerConversion.ts`

## Conclusao

O pipeline atual do URBANUS nao e apenas um roteador gravitacional.

Ele e um fluxo em camadas:

- primeiro prepara um grafo editavel com elevacao
- depois decide o backbone coletor por custo e gravidade
- depois recompae cobertura total
- depois reduz complexidade topologica
- por fim transforma isso em rede hidraulicamente dimensionada e persistivel

Essa leitura e a que melhor descreve o comportamento real do codigo hoje.
