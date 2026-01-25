# Documentação do Algoritmo URBANUS 1.0.0

Este documento detalha o funcionamento do algoritmo implementado na versão 1.0.0 do sistema URBANUS, uma aplicação desenvolvida em Python com a biblioteca Streamlit para análise de redes urbanas.

## Visão Geral

O propósito central do URBANUS 1.0.0 é processar uma rede de infraestrutura urbana (como redes de saneamento, arruamento, etc.) a partir de dados geográficos discretos. A aplicação constrói um modelo de grafo a partir de segmentos de reta (definidos por coordenadas de início e fim) e, em seguida, processa esse grafo para "normalizar" o comprimento de suas arestas, subdividindo as que excedem um comprimento máximo definido pelo usuário.

O sistema é modularizado em uma interface de usuário baseada em abas, com a lógica de processamento centralizada em funções utilitárias.

## Arquitetura e Componentes

A aplicação é estruturada da seguinte forma:

- **`main.py`**: O ponto de entrada da aplicação Streamlit. Gerencia a navegação entre a tela de introdução e a interface principal.
- **`config.py`**: Um arquivo central para armazenar o estado global da aplicação. Guarda variáveis compartilhadas entre os diferentes módulos, como o DataFrame com os dados, os objetos do grafo, a imagem do mapa, etc.
- **`utils.py`**: Contém toda a lógica de processamento do algoritmo. É o cérebro da aplicação, responsável pela leitura de dados, criação e manipulação dos grafos.
- **Módulos de Abas (`tab_*.py`)**: Cada arquivo `tab_` corresponde a uma seção da interface do usuário.
  - `tab_main.py`: A tela inicial de boas-vindas.
  - `tab_inputs.py`: O layout principal que organiza as outras abas de entrada de dados e visualização.
  - `tab_data_spreadsheet.py`: A seção para upload do arquivo de dados (planilha Excel).
  - `tab_map.py`: A seção para upload de um mapa de fundo em PDF e sua georreferenciação.
  - `tab_graph.py`: A seção onde o grafo processado é visualizado e onde o usuário pode ajustar parâmetros de visualização e processamento.

## Fluxo de Execução do Algoritmo

O processo, do ponto de vista do usuário e do sistema, ocorre na seguinte sequência:

### 1. Carregamento dos Dados (`tab_data_spreadsheet.py`)

1.  O usuário seleciona e faz o upload de um arquivo de planilha Excel (`.xlsx`).
2.  O sistema espera que este arquivo contenha, nas duas primeiras colunas, as coordenadas de início e fim de cada segmento de reta da rede. As coordenadas devem estar em formato de string, separadas por vírgula (ex: `"123.45,678.90"`).
3.  A função `utils.read_spreadsheet_data` é chamada. Ela lê o arquivo usando a biblioteca `pandas`, criando um DataFrame. As colunas são nomeadas para `source` (origem) e `target` (destino).
4.  O DataFrame é armazenado na variável global `config.df_data_points`.

### 2. Carregamento do Mapa de Fundo (Opcional) (`tab_map.py`)

1.  O usuário pode optar por carregar um arquivo PDF, que servirá como um mapa de fundo para a visualização do grafo.
2.  Para que o mapa seja posicionado corretamente, o usuário deve inserir as coordenadas (X, Y) do canto inferior esquerdo e do canto superior direito da imagem.
3.  O sistema utiliza a biblioteca `PyMuPDF` (`fitz`) para extrair a primeira página do PDF como uma imagem.
4.  Essa imagem e as coordenadas de limite são armazenadas nas variáveis globais `config.pdf_image`, `config.x1`, `config.y1`, etc.

### 3. Geração e Processamento do Grafo (`tab_graph.py` e `utils.py`)

Esta é a etapa principal do algoritmo, acionada quando o usuário interage com a aba do grafo.

1.  **Entrada do Usuário**: O usuário define um "Valor base para definir os intervalos" (`new_base_interval_value`). Este valor é o comprimento máximo que cada aresta no grafo processado deve ter.

2.  **Criação do Grafo Inicial (`utils.get_input_graph_data`)**:
    -   O DataFrame `config.df_data_points` é processado.
    -   **Identificação de Nós**: Cada par de coordenadas único (seja em `source` ou `target`) é identificado como um nó e recebe um ID numérico exclusivo.
    -   **Criação do Grafo**: Um objeto de grafo (`config.G`) é criado usando a biblioteca `networkx`. Os nós são os IDs numéricos, e as arestas são criadas conectando os nós de `source` e `target` de cada linha da planilha.
    -   **Cálculo de Distância**: Para cada aresta, a distância euclidiana entre seu ponto de `source` e `target` é calculada e armazenada como um atributo da aresta chamado `distance`.
    -   **Posições dos Nós**: Um dicionário (`config.pos`) é criado para mapear cada ID de nó às suas coordenadas (X, Y) reais.

3.  **Subdivisão de Arestas (`utils.process_graph`)**:
    -   Um novo grafo vazio, `config.G_processed`, é criado.
    -   O algoritmo itera sobre cada aresta do grafo inicial `config.G`.
    -   Para cada aresta, ele compara seu atributo `distance` com o `new_base_interval_value` fornecido pelo usuário.
    -   **Se a distância da aresta for maior que o valor base**: A aresta é subdividida. O número de novos nós intermediários necessários é calculado. As posições desses novos nós são interpoladas linearmente ao longo do segmento de reta da aresta original. Os novos nós e as novas arestas (mais curtas) são adicionados ao `config.G_processed`.
    -   **Se a distância da aresta for menor ou igual ao valor base**: A aresta é adicionada diretamente ao `config.G_processed` sem modificação.

4.  **Visualização do Grafo Final**:
    -   **Coloração**: Os nós no `config.G_processed` são coloridos de acordo com sua função: nós de interseção (grau >= 3) recebem uma cor, nós intermediários recém-criados recebem outra, e os demais nós recebem uma terceira cor (`utils.get_node_colors`).
    -   **Desenho**: O `config.G_processed` é desenhado na tela usando `matplotlib` e `networkx`. As posições dos nós são obtidas de `config.new_pos` (que contém as posições dos nós originais e dos novos).
    -   Se um mapa de fundo foi carregado, o grafo é desenhado como uma camada sobre a imagem do mapa, respeitando o sistema de coordenadas definido.

## Resultado Final

O resultado é uma visualização de um grafo que representa a rede urbana de entrada, mas com a garantia de que nenhuma aresta é mais longa do que o limite especificado pelo usuário. Este grafo "normalizado" pode ser usado para análises ou simulações subsequentes que se beneficiam ou requerem segmentos de rede com comprimentos mais uniformes.
