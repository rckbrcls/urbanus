# 06 -- Formulas Hidraulicas e Normas

## Normas de Referencia

| Norma | Titulo | Escopo |
|-------|--------|--------|
| NBR 9649 | Projeto de redes coletoras de esgoto sanitario | Dimensionamento, declividade minima, lâmina, velocidade, tensao trativa |
| NBR 14486 | Sistemas enterrados para conducao de esgoto sanitario | Assentamento, recobrimento, materiais |
| NBR 12207 | Projeto de interceptores de esgoto sanitario | Interceptores (trechos de maior porte) |

## Formula de Manning

A equacao de Manning-Strickler e a base do dimensionamento hidraulico de coletores de esgoto operando como condutos livres (escoamento por gravidade).

### Velocidade

```
V = (1/n) * Rh^(2/3) * I^(1/2)
```

| Simbolo | Descricao | Unidade |
|---------|-----------|---------|
| V | Velocidade media do escoamento | m/s |
| n | Coeficiente de Manning (rugosidade) | -- |
| Rh | Raio hidraulico | m |
| I | Declividade do coletor | m/m |

Implementacao: `urbanus_geo.calculations.manning_velocity(rh, slope, n)`

### Vazao

```
Q = A * V
```

Onde `A` e a area molhada da secao transversal.

No pipeline atual, a vazao volumetrica parcial e calculada diretamente dentro do dimensionamento a partir da area molhada e da velocidade de Manning.

## Raio Hidraulico para Secao Circular Parcialmente Cheia

Coletores de esgoto operam como condutos livres -- a secao nao e totalmente preenchida. O raio hidraulico depende da profundidade da lâmina d'agua `y` em relacao ao diâmetro `D`.

Para uma secao circular com diâmetro `D` e profundidade de lâmina `y`:

```
theta = 2 * arccos(1 - 2*y/D)       # angulo central do setor molhado
A = (D^2 / 8) * (theta - sin(theta)) # area molhada
P = (D / 2) * theta                   # perimetro molhado
Rh = A / P                            # raio hidraulico
```

Implementacao: `urbanus_geo.calculations.hydraulic_radius_partial(diameter, depth)`

## Tensao Trativa

A tensao trativa (ou tensao cisalhante no fundo) determina a capacidade de autolimpeza do coletor. E o criterio fundamental da NBR 9649 para garantir que solidos nao se depositem.

```
tau = gamma * Rh * I
```

| Simbolo | Descricao | Valor |
|---------|-----------|-------|
| tau | Tensao trativa | Pa (N/m2) |
| gamma | Peso especifico da agua | 9810 N/m3 |
| Rh | Raio hidraulico | m |
| I | Declividade | m/m |

**Criterio**: `tau >= 1.0 Pa` (para n = 0.013). Para PVC (n = 0.010): `tau >= 0.6 Pa`.

Implementacao: `urbanus_geo.calculations.tractive_stress(rh, slope)`

## Declividade Minima

A NBR 9649, secao 5.1.4, define a declividade minima em funcao da vazao inicial:

```
I_min = 0.0055 * Qi^(-0.47)
```

Onde `Qi` e a vazao no inicio do trecho em L/s, com minimo de 1.5 L/s.

Esta formula garante que a tensao trativa minima seja atendida mesmo no inicio de operacao do sistema, quando a vazao e pequena.

Implementacao: `urbanus_geo.calculations.min_slope(qi_ls)`

## Estimativa de Vazao de Esgoto

### Vazao Media

```
Q_d = (P * q * C) / 86400
```

| Simbolo | Descricao | Valor Padrao |
|---------|-----------|--------------|
| P | Populacao contribuinte | habitantes |
| q | Consumo per capita | 150 L/hab/dia |
| C | Coeficiente de retorno | 0.80 |
| Q_d | Vazao media | L/s |

### Vazao de Pico

```
Q_max = K1 * K2 * Q_d + Q_inf + Q_c
```

| Simbolo | Descricao | Valor Padrao |
|---------|-----------|--------------|
| K1 | Coeficiente de maximo diario | 1.2 |
| K2 | Coeficiente de maximo horario | 1.5 |
| Q_inf | Vazao de infiltracao | 0.05 a 1.0 L/s/km |
| Q_c | Vazao concentrada | 0 (default) |

Implementacoes:
- `urbanus_geo.calculations.sewage_flow_estimate(population, per_capita, return_coef)`
- `urbanus_geo.calculations.peak_flow(q_d, k1, k2, q_inf, q_c)`

## Restricoes de Projeto (NBR 9649)

| Restricao | Criterio | Valor |
|-----------|----------|-------|
| Tensao trativa minima | tau >= MIN_TRACTIVE_STRESS | 1.0 Pa (n=0.013) |
| Lâmina maxima | y/D <= MAX_FLOW_DEPTH_RATIO | 0.75 (75%) |
| Velocidade maxima | V <= MAX_VELOCITY | 5.0 m/s |
| Vazao minima | Q >= MIN_FLOW_RATE | 1.5 L/s |
| Diâmetro minimo (coletor) | DN >= MIN_DIAMETER_COLLECTOR | 150 mm |
| Diâmetro minimo (ramal) | DN >= MIN_DIAMETER_LATERAL | 100 mm |
| Recobrimento minimo (rua) | h >= MIN_COVER_STREET | 0.90 m |
| Recobrimento minimo (calcada) | h >= MIN_COVER_SIDEWALK | 0.65 m |
| Espacamento maximo entre PVs | L <= MAX_PV_SPACING | 100 m |

## Diâmetros Nominais Disponiveis

```
PIPE_DIAMETERS = [100, 150, 200, 250, 300, 400, 500, 600, 800, 1000] mm
```

O algoritmo de dimensionamento itera do menor para o maior diâmetro e seleciona o primeiro que atende todas as restricoes.

## Coeficiente de Manning

| Material | n |
|----------|---|
| Todos os materiais com biofilme (padrao NBR) | 0.013 |
| PVC novo | 0.010 |

A NBR 9649 recomenda n = 0.013 como valor conservador que incorpora o efeito do biofilme que se forma internamente nos coletores ao longo do tempo.

## Acessorios de Rede

| Tipo | Sigla | Condicao de Uso |
|------|-------|-----------------|
| Poco de Visita | PV | Intersecoes, mudanca de direcao > 45 graus, mudanca de diâmetro, inicio de coletor, espacamento > 100 m |
| Terminal de Inspecao e Limpeza | TIL | Inicio de coletor com DN <= 150 mm |
| Terminal de Limpeza | TL | Alternativa ao PV em trechos simples |
| Caixa de Passagem | CP | Ligacao de ramal predial ao coletor |

Dimensoes minimas:
- `PV_MIN_LID_DIAMETER = 0.60 m` (abertura da tampa)
- `PV_MIN_CHAMBER_SIZE = 0.80 m` (diâmetro interno da câmara)

## Funcao de Custo das Arestas

Usada pelo RSPH (Etapa 6) para ponderar os caminhos. Combina tres componentes:

### Custo de Tubulacao

```
C_pipe = PIPE_UNIT_COST * length
```

### Custo de Escavacao

Modelo quadratico que reflete o aumento exponencial de custo com a profundidade:

```
C_excavation = (EXCAVATION_A_COEF * depth^2 + EXCAVATION_B_COEF * depth) * length
```

### Penalidade de Declividade

```
SE declividade <= 0 (contra-gravidade):
    C_slope = PUMP_PENALTY = 100000 R$

SE 0 < declividade < 0.005 (insuficiente):
    C_slope = SLOPE_PENALTY * (0.005 - s) / 0.005 * length

SE declividade >= 0.005 (adequada):
    C_slope = 0
```

### Bonus de Reutilizacao

```
SE aresta ja incorporada na arvore:
    discount = REUSE_BONUS = 0.5
SENAO:
    discount = 1.0
```

### Custo Total

```
C_total = (C_pipe + C_excavation + C_slope) * discount
```

## Valor Presente Liquido (VPL) para Elevatorias

Quando uma elevatoria e necessaria (Etapa 7), o custo e avaliado em VPL:

```
VPL = CAPEX + sum(OPEX_anual / (1 + r)^t, t=1..N)
```

| Parametro | Valor |
|-----------|-------|
| CAPEX | PUMP_CAPEX_MIN = 150000 R$ |
| OPEX anual | ~5% do CAPEX |
| Horizonte (N) | 20 anos |
| Taxa de desconto (r) | 10% |

Implementacao: `urbanus_geo.calculations.pump_npv(capex, annual_opex, years, rate)`
