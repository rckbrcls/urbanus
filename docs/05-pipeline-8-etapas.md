# 05 -- Pipeline de Processamento dos Grafos

## Objetivo Deste Documento

Este documento descreve o **pipeline real em execucao hoje**, seguindo a ordem de [`process_sewer_network`](../apps/api/src/urbanus_api/main.py). O foco aqui e ajudar a ler o codigo com contexto:

- qual objeto entra e qual objeto sai de cada etapa;
- quais arquivos participam do fluxo;
- quais etapas ainda existem no codigo, mas nao sao mais chamadas pelo endpoint;
- onde o pipeline deixa de ser um grafo viario e passa a ser uma rede de esgoto dirigida.

Se voce quiser uma visao navegavel com uma lista curta de todas as etapas e links diretos para os arquivos, veja tambem [13-fluxo-completo-pipeline.md](13-fluxo-completo-pipeline.md).

## Ideia Geral

O endpoint [`POST /projects/{project_id}/process`](../apps/api/src/urbanus_api/main.py) transforma um grafo viario com elevacao em uma rede coletora de esgoto representada por um `SewerNetwork`.

O pipeline trabalha com **tres representacoes principais**:

1. `G` -- `nx.Graph` nao direcionado da malha viaria.
2. `tree` -- `nx.DiGraph` orientado no sentido do escoamento.
3. `SewerNetwork` -- estrutura serializada de saida com nos, arestas, tubos, elevatorias e custo.

## Glossario Minimo Para Ler o Codigo

### `G`

Grafo nao direcionado base. Cada no carrega coordenadas e elevacao, e cada aresta carrega geometria simplificada da rua e comprimento.

### `tree`

Grafo dirigido usado como rede de escoamento. Ele precisa ser um **DAG** antes do dimensionamento.

### DAG

`Directed Acyclic Graph`: grafo dirigido sem ciclos. No contexto do projeto, significa que a agua residual sempre tem um sentido consistente de montante para jusante.

### `mandatory`

Conjunto de nos que o algoritmo precisa conectar no roteamento. Ele e derivado de `pv_obrigatorio=True` e de alguns `node_type="ROSA"` apos as etapas de sanitizacao.

### `outlet`

No com menor elevacao no grafo atual. Ele funciona como exutorio global.

### `collection_points`

Pontos de coleta usados pelo RSPH. Quando o grafo editado traz marcacoes manuais, elas sao respeitadas. Sem marcacao manual, o pipeline usa o `outlet` e os nos `AZUL_ESCURO`, mas colapsa minimos locais proximos para manter apenas o ponto mais baixo de cada cluster.

### `unreachable`

Nos obrigatorios que o RSPH nao conseguiu conectar por gravidade no grafo dirigido.

## Fluxo Real de Execucao

O fluxo principal esta em [`main.py`](../apps/api/src/urbanus_api/main.py).

```text
Projeto / grafo editado
    -> construir G
    -> sanear elevacoes espurias
    -> classificar e marcar nos obrigatorios
    -> sanitizar topologia
    -> detectar extremos e quebra de greide
    -> escolher outlet e collection points
    -> RSPH
    -> resolver inalcanhaveis / pontos baixos
    -> garantir cobertura completa das ruas
    -> quebrar ciclos, se necessario
    -> otimizar numero de nos
    -> dimensionar hidraulica
    -> atribuir acessorios
    -> calcular custo total
    -> persistir e retornar SewerNetwork
```

## Etapa 0 -- Entrada do Endpoint e Construcao do Grafo Base

### Arquivos

- [`main.py`](../apps/api/src/urbanus_api/main.py)
- [`builder.py`](../apps/api/src/urbanus_api/core/graph/builder.py)
- [`classification.py`](../apps/api/src/urbanus_api/core/graph/classification.py)

### O que entra

- `project_id`
- opcionalmente um grafo editado vindo do frontend (`nodes` e `edges`)

### O que sai

- `G: nx.Graph`

### Como funciona

O endpoint pode seguir dois caminhos:

1. Se vier corpo com `nodes`, usa [`_build_graph_from_edited`](../apps/api/src/urbanus_api/main.py) e reconstrui `G` diretamente do payload.
2. Caso contrario, usa o `streets_geojson` salvo e monta `G` com [`build_graph_from_geojson`](../apps/api/src/urbanus_api/core/graph/builder.py).

### Detalhe importante

Hoje o fluxo principal **nao comeca carregando PostGIS processado**. O caminho usado pelo endpoint atual parte do grafo editado enviado pelo frontend ou reconstrui `G` a partir do `streets_geojson` salvo do projeto.

### Como `build_graph_from_geojson` condensa a malha

[`build_graph_from_geojson`](../apps/api/src/urbanus_api/core/graph/builder.py) faz mais do que so converter GeoJSON em arestas:

- chama [`extract_nodes(..., mode="all")`](../apps/api/src/urbanus_api/core/graph/classification.py);
- mantem apenas **anchors**: intersecoes e endpoints;
- liga anchors consecutivos ao longo de cada rua;
- garante que ruas sem anchors ainda tenham cobertura via `_ensure_street_coverage`;
- conecta componentes desconectados com `_connect_components`.

Resultado: `G` ja nasce como um grafo estrutural da malha, nao como um espelho literal de todos os vertices OSM.

## Etapa 0.5 -- Saneamento de Elevacoes Espurias do DEM

### Arquivo

- [`main.py`](../apps/api/src/urbanus_api/main.py)

### Funcao

- [`_sanitize_spurious_zero_elevations`](../apps/api/src/urbanus_api/main.py)

### Objetivo

Corrigir casos em que o DEM devolve elevacao `0` em bordas do raster. Se um no esta em `0` mas os vizinhos estao muito acima, o valor vira `None`.

### Por que existe

Sem isso, o `outlet` poderia ser escolhido por um artefato do raster, e o roteamento ficaria enviesado.

## Etapa 1 -- Classificacao Base de Nos

### Arquivo

- [`classification.py`](../apps/api/src/urbanus_api/core/graph/classification.py)

### Funcoes centrais

- [`extract_nodes`](../apps/api/src/urbanus_api/core/graph/classification.py)
- [`_cluster_nearby_nodes`](../apps/api/src/urbanus_api/core/graph/classification.py)
- [`enforce_direction_changes`](../apps/api/src/urbanus_api/core/graph/classification.py)

### O que essa etapa faz

Ela define quais nos sao estruturalmente relevantes para o pipeline.

#### Regras usadas em `extract_nodes`

- endpoints viram `ROSA` e `pvObrigatorio=True`;
- quedas abruptas de elevacao entre vertices adjacentes tambem podem virar `ROSA`;
- intersecoes sao reconhecidas pelo `degree`, mas nao sao automaticamente PV obrigatorio apos o clustering;
- o maior extremo entre intersecoes pode virar `AMARELO`;
- o menor extremo entre intersecoes pode virar `AZUL_ESCURO`.

#### Clustering espacial

[`_cluster_nearby_nodes`](../apps/api/src/urbanus_api/core/graph/classification.py) usa Union-Find e `haversine` para fundir nos a ate `SNAP_DISTANCE_METERS = 5 m`.

Esse passo e essencial para eliminar falsas desconexoes e cruzamentos quebrados do OSM.

#### Mudanca de direcao

Depois que `G` ja existe, [`enforce_direction_changes`](../apps/api/src/urbanus_api/core/graph/classification.py) marca como `ROSA` qualquer no de grau 2 cuja deflexao seja maior que `45°`.

### Como pensar nessa etapa

Esta fase responde: **quais pontos da geometria viaria merecem sobreviver como decisoes de engenharia?**

## Etapa 2 -- Sanitizacao Topologica de `G`

### Arquivo

- [`sanitization.py`](../apps/api/src/urbanus_api/core/graph/sanitization.py)

### Funcoes chamadas no fluxo real

- [`remove_redundant_nodes`](../apps/api/src/urbanus_api/core/graph/sanitization.py)
- [`resolve_curve_clusters`](../apps/api/src/urbanus_api/core/graph/sanitization.py)
- [`enforce_min_pv_spacing`](../apps/api/src/urbanus_api/core/graph/sanitization.py)
- [`detect_grade_breaks`](../apps/api/src/urbanus_api/core/graph/sanitization.py)

### 2.1 Remocao de nos redundantes

[`remove_redundant_nodes`](../apps/api/src/urbanus_api/core/graph/sanitization.py) remove nos de grau 2 nao obrigatorios quando ambos os lados sao curtos e a fusao nao cria um trecho longo demais.

Intuicao: se um no nao muda conectividade, nao marca curva importante e esta entre dois trechos curtinhos, ele so infla a rede.

### 2.2 Resolucao de clusters de curva

[`resolve_curve_clusters`](../apps/api/src/urbanus_api/core/graph/sanitization.py) tenta substituir curvas muito agudas por um unico no melhor posicionado, aproximando a intersecao das tangentes.

Isso reduz “quebras artificiais” de geometria antes do roteamento.

Quando a heuristica de tangentes cai exatamente na mesma coordenada do no original, a etapa trata isso como no-op e preserva o no atual. Isso evita loop infinito em grafos editados no frontend, onde um no intermediario de grau 2 pode chegar ao pipeline sem geometria adicional para reposicionamento.

### 2.3 Espacamento minimo entre PVs

[`enforce_min_pv_spacing`](../apps/api/src/urbanus_api/core/graph/sanitization.py) funde PVs obrigatorios proximos demais quando a topologia permite.

Objetivo: evitar concentracao desnecessaria de estruturas de inspecao.

### 2.4 Quebra de greide

[`detect_grade_breaks`](../apps/api/src/urbanus_api/core/graph/sanitization.py) marca nos com mudanca forte de declividade entre as arestas adjacentes.

Importante: essa funcao marca `node_type="ROSA"`, mas **nao seta sempre** `pv_obrigatorio=True`. O otimizador posterior ainda pode decidir manter ou remover conforme o contexto do trecho.

## Etapa 3 -- Extremos Topograficos

### Arquivo

- [`extrema.py`](../apps/api/src/urbanus_api/core/elevation/extrema.py)

### Funcao

- [`detect_extrema`](../apps/api/src/urbanus_api/core/elevation/extrema.py)

### O que faz

Detecta:

- `AMARELO`: maximo local;
- `AZUL_ESCURO`: minimo local.

O algoritmo compara o no com seus vizinhos e aplica um filtro de proeminencia via BFS para evitar ruido do DEM.

### Impacto no pipeline

No pipeline atual, `AZUL_ESCURO` nao e apenas decoracao visual. Esses nos entram no conjunto de `collection_points` antes do RSPH.

## Etapa 4 -- Recalculo de Nos Obrigatorios, Escolha do Outlet e Pontos de Coleta

### Arquivo

- [`main.py`](../apps/api/src/urbanus_api/main.py)

### O que acontece aqui

Depois da sanitizacao, o endpoint recompila `mandatory` a partir de:

- `pv_obrigatorio=True`;
- ou `node_type == "ROSA"`.

Em seguida:

- escolhe o `outlet` como o no com menor elevacao conhecida;
- define `collection_points` a partir da selecao manual (`is_collection_point`) quando existir; caso contrario usa o `outlet` e os `AZUL_ESCURO` deduplicados espacialmente;
- marca `is_collection_point=True` nesses nos.

### Leitura conceitual

Neste ponto o pipeline deixa de ser apenas “limpeza de malha” e passa a formular um problema de escoamento:

- quais nos precisam estar conectados;
- para onde eles podem convergir;
- qual o sumidouro global do sistema.

## Etapa 5 -- Roteamento Gravitacional com RSPH

### Arquivos

- [`rsph.py`](../apps/api/src/urbanus_api/core/routing/rsph.py)
- [`cost.py`](../apps/api/src/urbanus_api/core/routing/cost.py)

### O que entra

- `G` nao direcionado
- `mandatory`
- `outlet`
- `collection_points`

### O que sai

- `tree: nx.DiGraph`
- `unreachable: list[str]`

### Como o RSPH funciona

[`rsph_sewer_routing`](../apps/api/src/urbanus_api/core/routing/rsph.py):

1. cria um `DiGraph` apenas com direcoes compativeis com gravidade;
2. cria um `SUPER_SINK` virtual;
3. conecta os collection points ao `SUPER_SINK`;
4. ordena os nos obrigatorios por elevacao decrescente;
5. para cada no, roda Dijkstra com a funcao [`edge_cost`](../apps/api/src/urbanus_api/core/routing/cost.py);
6. adiciona o caminho resultante a `tree`;
7. registra como `unreachable` quem nao achou caminho.

### Por que o custo importa

[`edge_cost`](../apps/api/src/urbanus_api/core/routing/cost.py) combina:

- custo de tubulacao;
- custo de escavacao;
- penalidade por declividade ruim;
- desconto por reutilizacao (`REUSE_BONUS`).

Isso faz o RSPH tender a formar troncos compartilhados em vez de ligar cada no com um caminho isolado.

### Diferenca importante para a leitura do codigo

O RSPH atual e **multi-colecao**: ele nao liga cada no necessariamente ao `outlet` global, mas sim ao collection point mais barato via `SUPER_SINK`.

## Etapa 6 -- Resolucao de Nos Inalcançaveis e Pontos Baixos

### Arquivo

- [`low_points.py`](../apps/api/src/urbanus_api/core/optimizer/low_points.py)

### Funcao

- [`resolve_low_points`](../apps/api/src/urbanus_api/core/optimizer/low_points.py)

### O que faz

Para cada no em `unreachable`, a etapa compara tres estrategias:

1. rota alternativa por gravidade;
2. escavacao profunda;
3. elevatoria.

Ela escolhe a opcao de menor custo e atualiza `tree`.

### Observacao importante

Apesar do docstring citar “nos AZUL_ESCURO ou unreachable”, a implementacao atual itera explicitamente sobre `unreachable`. Os `AZUL_ESCURO` influenciam o RSPH antes, ao virarem `collection_points`.

## Etapa 7 -- Cobertura Completa da Malha

### Arquivo

- [`coverage.py`](../apps/api/src/urbanus_api/core/graph/coverage.py)

### Funcao

- [`ensure_full_coverage`](../apps/api/src/urbanus_api/core/graph/coverage.py)

### O que faz

Depois do RSPH, a rede ainda pode cobrir apenas o tronco principal. Esta etapa reintroduz no `tree` todas as arestas de `G` que ainda nao entraram no resultado.

### Por que essa etapa existe

O RSPH resolve conectividade dos nos obrigatorios. Mas o produto quer mais do que isso: **cada rua precisa ter coletor**.

Entao esta etapa transforma a arvore/espinha dorsal do RSPH em uma rede dirigida que cobre toda a malha disponivel.

### Como as direcoes sao decididas

- se ambos os nos tem elevacao, a aresta aponta do mais alto para o mais baixo;
- se apenas um tem elevacao, a direcao privilegia o no com elevacao conhecida;
- se nenhum tem, usa conectividade ja existente para tentar manter coerencia;
- se a direcao gerar ciclo, tenta o sentido inverso.

## Etapa 7.5 -- Quebra de Ciclos

### Arquivo

- [`main.py`](../apps/api/src/urbanus_api/main.py)

### Funcao

- [`_break_cycles`](../apps/api/src/urbanus_api/main.py)

### O que faz

Depois de `ensure_full_coverage`, o endpoint checa se `tree` ainda e um DAG. Se houver ciclo:

- encontra um ciclo;
- remove a aresta “pior”, isto e, a que sobe mais ou desce menos;
- reexecuta `ensure_full_coverage` para reparar cobertura perdida.

### Por que isso e crucial

O dimensionamento hidraulico depende de `topological_sort`, entao a rede precisa estar aciclica antes da proxima fase.

## Etapa 7.8 -- Otimizacao de Numero de Nos

### Arquivo

- [`node_reduction.py`](../apps/api/src/urbanus_api/core/optimizer/node_reduction.py)

### Funcao publica

- [`optimize_node_placement`](../apps/api/src/urbanus_api/core/optimizer/node_reduction.py)

### O que essa etapa tenta fazer

Reduzir o numero de PVs e nos intermediarios sem destruir:

- direcao de escoamento;
- continuidade geometrica;
- mudancas relevantes de angulo;
- mudancas relevantes de declividade.

### Fases internas

#### Fase 1 -- Contracao gulosa

Remove nos “pass-through” e simplifica juncoes quando o trecho continua aceitavel como tubo de passagem.

#### Fase 2 -- Fusão espacial de nos proximos

Agrupa nos dentro de `20 m`, preservando o `outlet`.

#### Fase 3 -- Refinamento MILP

Se `scipy.optimize.milp` estiver disponivel, resolve quais nos de cadeias podem sair sem violar o espacamento maximo.

#### Observacao importante

A funcao `_enforce_spacing` existe, mas o proprio comentario de [`optimize_node_placement`](../apps/api/src/urbanus_api/core/optimizer/node_reduction.py) explica que o pipeline atual **nao a executa** para evitar reintroduzir uma quantidade grande de nos.

## Etapa 8 -- Dimensionamento Hidraulico

### Arquivo

- [`dimensioning.py`](../apps/api/src/urbanus_api/core/hydraulics/dimensioning.py)

### Funcao

- [`dimension_network`](../apps/api/src/urbanus_api/core/hydraulics/dimensioning.py)

### O que entra

- `tree` como DAG dirigido

### O que sai

- `pipes: list[PipeSegment]`

### Como funciona

Para cada aresta de `tree`:

1. estima contribuicao a montante com `topological_sort`;
2. estima vazao de projeto;
3. calcula declividade minima;
4. escolhe o menor DN que satisfaz criterios hidraulicos;
5. calcula `invert_elevation` e profundidades.

### Criterios usados

- tensao trativa minima;
- relacao `y/D`;
- velocidade maxima;
- recobrimento minimo.

### Efeito colateral util

Essa etapa grava no proprio `tree` atributos como:

- `invert_elevation`
- `rim_elevation`
- `depth`
- `needs_pump_review`

Ou seja: o grafo vira tambem um suporte para resultados hidraulicos, nao apenas topologicos.

## Etapa 9 -- Atribuicao de Acessorios

### Arquivo

- [`accessories.py`](../apps/api/src/urbanus_api/core/graph/accessories.py)

### Funcao

- [`assign_accessory_types`](../apps/api/src/urbanus_api/core/graph/accessories.py)

### O que faz

Classifica cada no da rede final como:

- `PV`
- `CP`
- `TIL`
- `TL`

### Regras principais

- grau total `>= 3` vira `PV`;
- mudanca de direcao relevante vira `PV`;
- mudanca de diametro entre trechos adjacentes vira `PV`;
- no intermediario reto e de mesmo diametro vira `CP`;
- terminais pequenos tendem a virar `TIL`.

## Etapa 10 -- Persistencia, Custo e Resposta

### Arquivos

- [`builder.py`](../apps/api/src/urbanus_api/core/graph/builder.py)
- [`costing.py`](../apps/api/src/urbanus_api/core/hydraulics/costing.py)
- [`types.py`](../py/urbanus-geo/src/urbanus_geo/types.py)

### O que acontece

1. [`save_sewer_network_to_postgis`](../apps/api/src/urbanus_api/core/graph/builder.py) salva a `SewerNetwork` completa nas tabelas do projeto.
2. [`compute_total_cost`](../apps/api/src/urbanus_api/core/hydraulics/costing.py) calcula o custo agregado.
3. O endpoint monta e retorna um [`SewerNetwork`](../py/urbanus-geo/src/urbanus_geo/types.py).

## Etapas Que Existem no Codigo, Mas Nao Estao no Fluxo Principal

### `sanitize_long_edges`

Arquivo: [`sanitization.py`](../apps/api/src/urbanus_api/core/graph/sanitization.py)

Ainda existe no codigo, mas o endpoint atual nao chama essa funcao. O comentario em [`main.py`](../apps/api/src/urbanus_api/main.py) explica que ela gerava muitos nos intermediarios e inflava a rede.

### `subdivide_steep_edges`

Arquivo: [`sanitization.py`](../apps/api/src/urbanus_api/core/graph/sanitization.py)

Tambem existe, mas nao participa do fluxo atual por razoes semelhantes.

## Ordem Recomendada de Leitura do Codigo

Se o objetivo for entender o pipeline lendo o codigo, esta e a ordem mais eficiente:

1. [`main.py`](../apps/api/src/urbanus_api/main.py) -- enxergar o orquestrador.
2. [`builder.py`](../apps/api/src/urbanus_api/core/graph/builder.py) -- entender como `G` nasce.
3. [`classification.py`](../apps/api/src/urbanus_api/core/graph/classification.py) -- entender os tipos de no.
4. [`sanitization.py`](../apps/api/src/urbanus_api/core/graph/sanitization.py) e [`extrema.py`](../apps/api/src/urbanus_api/core/elevation/extrema.py) -- entender limpeza e anotacao topografica.
5. [`rsph.py`](../apps/api/src/urbanus_api/core/routing/rsph.py) e [`cost.py`](../apps/api/src/urbanus_api/core/routing/cost.py) -- entender a heuristica principal.
6. [`coverage.py`](../apps/api/src/urbanus_api/core/graph/coverage.py) e [`node_reduction.py`](../apps/api/src/urbanus_api/core/optimizer/node_reduction.py) -- entender como o tronco vira rede completa e depois e simplificado.
7. [`dimensioning.py`](../apps/api/src/urbanus_api/core/hydraulics/dimensioning.py) e [`accessories.py`](../apps/api/src/urbanus_api/core/graph/accessories.py) -- entender a saida de engenharia.

## Resumo Executivo do Pipeline Atual

O pipeline atual pode ser resumido assim:

1. constroi um grafo viario condensado;
2. marca nos relevantes para engenharia;
3. limpa topologia e geometrias problematicas;
4. detecta extremos topograficos;
5. escolhe para onde o esgoto pode convergir;
6. usa RSPH para montar a espinha dorsal de escoamento;
7. resolve o que nao coube por gravidade;
8. reintroduz cobertura completa das ruas;
9. remove complexidade desnecessaria;
10. dimensiona hidraulicamente e classifica os acessorios.

Ou seja: o sistema nao faz apenas “roteamento”. Ele alterna entre **modelagem topologica**, **heuristica de custo**, **cobertura territorial** e **dimensionamento hidraulico**.
