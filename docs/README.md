# URBANUS -- Documentacao Tecnica

Documentacao tecnica do projeto URBANUS, organizada para compilacao de relatorio de Iniciacao Cientifica (IC).

O URBANUS e uma plataforma de planejamento automatizado de redes coletoras de esgoto sanitario, combinando dados geoespaciais abertos (OpenStreetMap, OpenTopography) com algoritmos de otimizacao de grafos e dimensionamento hidraulico segundo a NBR 9649.

## Indice

| # | Documento | Descricao |
|---|-----------|-----------|
| 00 | [Visao Geral](00-visao-geral.md) | O que e o URBANUS, stack, arquitetura de alto nivel e fluxo do usuario |
| 01 | [Arquitetura do Monorepo](01-arquitetura-monorepo.md) | Estrutura de pastas, workspaces, Turbo, Makefile, Docker e variaveis de ambiente |
| 02 | [Tipos e Constantes](02-tipos-e-constantes.md) | Tipos geoespaciais canonicos (JS e Python), constantes NBR 9649 e utilitarios |
| 03 | [Backend FastAPI](03-backend-api.md) | Endpoints, modelos Pydantic, camada de dados e servicos externos |
| 04 | [Banco de Dados](04-banco-de-dados.md) | Schema PostGIS, tabelas, indices espaciais e migracoes Alembic |
| 05 | [Pipeline de 8 Etapas](05-pipeline-8-etapas.md) | Classificacao, sanitizacao, elevacao, roteamento, otimizacao e dimensionamento |
| 06 | [Hidraulica e NBR 9649](06-hidraulica-nbr9649.md) | Manning, tensao trativa, declividade minima, vazao e funcao de custo |
| 07 | [Algoritmos Geoespaciais](07-algoritmos-geo.md) | Haversine, area, amostragem de elevacao, interpolacao, angulos e proeminencia |
| 08 | [Frontend Next.js](08-frontend.md) | Estrutura, App Router, componentes de mapa, paineis e modos de edicao |
| 09 | [Estado e Stores](09-estado-e-stores.md) | graphStore, commandManager, useMapStore, useProjectStore, areaSelectionStore |
| 10 | [Editor de Grafos](10-editor-de-grafos.md) | Modelo de dados, useGraphEditor, drag, snapping, Command Pattern e serialization |
| 11 | [Elevacao e Topografia](11-elevacao-e-topografia.md) | OpenTopography API, pipeline GeoTIFF, amostragem bilinear e limitacoes |
| 12 | [Referencias](12-referencias.md) | Projetos open-source, literatura academica, normas e APIs |

## Convencoes

- Linguagem: portugues brasileiro (pt-BR)
- Termos tecnicos em ingles quando sao nomes de bibliotecas ou conceitos consagrados
- Pseudocodigo em Python (backend) ou TypeScript (frontend)
- Todos os nomes de arquivos, tipos e constantes refletem o codigo-fonte atual
